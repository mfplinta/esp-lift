#include "driver/gpio.h"
#include "driver/uart.h"
#include "driver/uart_vfs.h"
#include "esp_attr.h"
#include "esp_littlefs.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include <ctype.h>
#include <dirent.h>
#include <fcntl.h>
#include <stdio.h>
#include <unistd.h>

#include "config.h"
#include "encoder.h"
#include "http_handler_fs.h"
#include "wifi.h"
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <sys/types.h>

#define ANSI_CURSOR_UP(n) "\033[" #n "A"
#define ANSI_CLEAR_LINE "\033[2K\r"

const char *WWW_PARTLABEL = "www";
const char *CFG_PARTLABEL = "cfg";

const char *TAG_WS = "HTTP_WS";

typedef struct async_resp_arg {
  httpd_handle_t hd;
  char *data;
} async_resp_arg;

static QueueHandle_t encoder_evt_queue = NULL;

static void ws_async_send(void *arg) {
  struct async_resp_arg *resp_arg = arg;
  httpd_ws_frame_t ws_pkt = {.payload = (uint8_t *) resp_arg->data,
                             .len = strlen(resp_arg->data),
                             .type = HTTPD_WS_TYPE_TEXT};

  static size_t max_clients = CONFIG_LWIP_MAX_LISTENING_TCP;
  size_t fds = max_clients;
  int client_fds[max_clients];

  esp_err_t ret = httpd_get_client_list(resp_arg->hd, &fds, client_fds);

  if (ret != ESP_OK) {
    goto cleanup;
  }

  for (int i = 0; i < fds; i++) {
    int client_info = httpd_ws_get_fd_info(resp_arg->hd, client_fds[i]);
    if (client_info == HTTPD_WS_CLIENT_WEBSOCKET) {
      httpd_ws_send_frame_async(resp_arg->hd, client_fds[i], &ws_pkt);
    }
  }

cleanup:
  free(resp_arg->data);
  free(resp_arg);
}

static void IRAM_ATTR encoder_producer_callback(encoder_event *event) {
  xQueueSendFromISR(encoder_evt_queue, event, NULL);
}

static void encoder_consumer_task(void *arg) {
  httpd_handle_t server = (httpd_handle_t) arg;
  encoder_event event;
  char rx_buffer[128];

  while (1) {
    if (!xQueueReceive(encoder_evt_queue, &event, portMAX_DELAY))
      continue;

    if (event.type == ENC_EVENT_ROTATION)
      if (event.source->is_calibrated) {
        snprintf(rx_buffer, sizeof(rx_buffer),
                 "{\"name\": \"%s\", \"event\": \"rotate\", \"calibrated\": %f}",
                 event.source->config->name, event.source->calibrated);
      } else {
        snprintf(rx_buffer, sizeof(rx_buffer),
                 "{\"name\": \"%s\", \"event\": \"rotate\", \"calibrated\": null}",
                 event.source->config->name);
      }
    else if (event.type == ENC_EVENT_CALIBRATION_DONE) {
      snprintf(rx_buffer, sizeof(rx_buffer), "{\"name\": \"%s\", \"event\": \"cal_done\"}",
               event.source->config->name);
    }

    async_resp_arg *resp_arg;
    if (!(resp_arg = malloc(sizeof(async_resp_arg)))) {
      ESP_LOGE("HTTP_WS", "Could not allocate for response");
      continue;
    }

    resp_arg->hd = server;
    resp_arg->data = strdup(rx_buffer);

    if (httpd_queue_work(server, ws_async_send, resp_arg) != ESP_OK) {
      free(resp_arg->data);
      free(resp_arg);
    }
  }
}

static esp_err_t ws_handler(httpd_req_t *req) {
  if (req->method == HTTP_GET) {
    ESP_LOGI(TAG_WS, "New client connected.");
    return ESP_OK;
  }

  httpd_ws_frame_t ws_pkt;
  memset(&ws_pkt, 0, sizeof(httpd_ws_frame_t));

  esp_err_t ret = httpd_ws_recv_frame(req, &ws_pkt, 0);
  if (ret != ESP_OK) {
    return ret;
  }

  if (ws_pkt.type == HTTPD_WS_TYPE_TEXT) {
    ESP_LOGI(TAG_WS, "Received ws text of length %d", ws_pkt.len);

    uint8_t *buf = NULL;

    if (ws_pkt.len > 0) {
      buf = calloc(1, ws_pkt.len + 1);
      if (buf == NULL) {
        return ESP_ERR_NO_MEM;
      }
      ws_pkt.payload = buf;
      ret = httpd_ws_recv_frame(req, &ws_pkt, ws_pkt.len);
      if (ret != ESP_OK) {
        ESP_LOGE(TAG_WS, "httpd_ws_recv_frame failed with %d", ret);
      }
      free(buf);
      return ret;
    }
  } else {
    ESP_LOGW(TAG_WS, "Unsupported ws frame type %d", ws_pkt.type);
  }

  return ESP_OK;
}

esp_err_t restart_handler(httpd_req_t *req) {
  httpd_resp_send(req, "Restarting device...\n", HTTPD_RESP_USE_STRLEN);

  ESP_LOGI("RESTART", "ESP restarting now...");
  vTaskDelay(1000 / portTICK_PERIOD_MS);

  esp_restart();
  return ESP_OK;
}

encoder *leftEncoder = NULL;
encoder *rightEncoder = NULL;

esp_err_t calibrate_handler(httpd_req_t *req) {
  if (leftEncoder == NULL || rightEncoder == NULL)
    httpd_resp_send_err(req, 400, "");
  encoder_reset_calibration(leftEncoder);
  encoder_reset_calibration(rightEncoder);
  httpd_resp_send(req, "Clearing calibration...", HTTPD_RESP_USE_STRLEN);
  return ESP_OK;
}

void client_close_handler(httpd_handle_t hd, int sockfd) {
  ESP_LOGI(TAG_WS, "Cleaning up socket %d", sockfd);
  close(sockfd);
}

static char *httpd_read_body(httpd_req_t *req) {
  int total_len = req->content_len;
  int received = 0;
  char *buf = malloc(total_len + 1);

  if (buf == NULL) {
    return NULL;
  }

  while (received < total_len) {
    int ret = httpd_req_recv(req, buf + received, total_len - received);
    if (ret <= 0) {
      free(buf);
      return NULL;
    }
    received += ret;
  }

  buf[total_len] = '\0';
  return buf;
}

esp_err_t get_exercises_handler(httpd_req_t *req) {
  ESP_LOGI("HTTP_API", "GET: %s", req->uri);
  cJSON *root = (cJSON *) req->user_ctx;

  /* Serialize JSON in compact format */
  char *json_string = cJSON_PrintUnformatted(root);
  if (json_string == NULL) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to serialize JSON");
    return ESP_FAIL;
  }

  /* Set content type and send */
  httpd_resp_set_type(req, "application/json");
  esp_err_t res = httpd_resp_send(req, json_string, HTTPD_RESP_USE_STRLEN);

  free(json_string);
  return res;
}

esp_err_t post_exercises_handler(httpd_req_t *req) {
  ESP_LOGI("HTTP_API", "POST: %s", req->uri);
  cJSON *root = (cJSON *) req->user_ctx;
  esp_err_t res = ESP_FAIL;

  /* Read body */
  char *body = httpd_read_body(req);
  if (body == NULL) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to read body");
    return ESP_FAIL;
  }

  /* Parse JSON */
  cJSON *json = cJSON_Parse(body);
  free(body);

  if (json == NULL) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid JSON");
    return ESP_FAIL;
  }

  /* Extract fields */
  cJSON *name = cJSON_GetObjectItemCaseSensitive(json, "name");
  cJSON *threshold = cJSON_GetObjectItemCaseSensitive(json, "thresholdPercentage");
  cJSON *type = cJSON_GetObjectItemCaseSensitive(json, "type");

  if (!cJSON_IsString(name) || !cJSON_IsNumber(threshold) || !cJSON_IsString(type)) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing or invalid fields");
    goto cleanup;
  }

  exercise_type_t exercise_type = exercise_type_from_string(type->valuestring);
  if (exercise_type == EXERCISE_UNKNOWN) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid exercise type");
    goto cleanup;
  }

  /* Add exercise */
  if (!exercises_add(root, name->valuestring, threshold->valuedouble, exercise_type)) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to add exercise");
    goto cleanup;
  }

  /* Save */
  if (!exercises_save_to_file(root, "/cfg/config.json")) {
    ESP_LOGE("CONFIG", "Failed to save exercises");
  }

  httpd_resp_sendstr(req, "OK");
  res = ESP_OK;

cleanup:
  cJSON_Delete(json);
  return res;
}

static esp_err_t post_settings_handler(httpd_req_t *req) {
  ESP_LOGI("HTTP_API", "POST: %s", req->uri);

  cJSON *root = (cJSON *) req->user_ctx;
  if (!root) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Config not loaded");
    return ESP_FAIL;
  }

  char *body = httpd_read_body(req);
  if (!body) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Failed to read body");
    return ESP_FAIL;
  }

  cJSON *patch = cJSON_Parse(body);
  free(body);

  if (!patch) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid JSON");
    return ESP_FAIL;
  }

  /* -------- WIFI -------- */
  const cJSON *wifi = cJSON_GetObjectItemCaseSensitive(patch, "wifi");
  if (cJSON_IsObject(wifi)) {
    cJSON *dst = cJSON_GetObjectItem(root, "wifi");
    if (!dst) {
      dst = cJSON_CreateObject();
      cJSON_AddItemToObject(root, "wifi", dst);
    }

    cJSON *item;
    if ((item = cJSON_GetObjectItem(wifi, "ssid")))
      cJSON_ReplaceItemInObject(dst, "ssid", cJSON_Duplicate(item, 1));

    if ((item = cJSON_GetObjectItem(wifi, "password")))
      cJSON_ReplaceItemInObject(dst, "password", cJSON_Duplicate(item, 1));

    if ((item = cJSON_GetObjectItem(wifi, "hostname")))
      cJSON_ReplaceItemInObject(dst, "hostname", cJSON_Duplicate(item, 1));
  }

  /* Persist */
  if (!exercises_save_to_file(root, "/cfg/config.json")) {
    ESP_LOGE("CONFIG", "Failed to save config");
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Save failed");
    cJSON_Delete(patch);
    return ESP_FAIL;
  }

  cJSON_Delete(patch);
  httpd_resp_sendstr(req, "OK");
  return ESP_OK;
}

void url_decode(char *dst, const char *src) {
  char a, b;
  while (*src) {
    if ((*src == '%') && ((a = src[1]) && (b = src[2])) && isxdigit(a) && isxdigit(b)) {
      if (a >= 'a')
        a -= 'a' - 'A';
      if (a >= 'A')
        a -= ('A' - 10);
      else
        a -= '0';
      if (b >= 'a')
        b -= 'a' - 'A';
      if (b >= 'A')
        b -= ('A' - 10);
      else
        b -= '0';
      *dst++ = 16 * a + b;
      src += 3;
    } else if (*src == '+') {
      *dst++ = ' '; // convert + to space
      src++;
    } else {
      *dst++ = *src++;
    }
  }
  *dst = '\0';
}

esp_err_t delete_exercises_handler(httpd_req_t *req) {
  ESP_LOGI("HTTP_API", "DELETE: %s", req->uri);
  cJSON *root = (cJSON *) req->user_ctx;

  char name[128];
  if (httpd_req_get_url_query_str(req, name, sizeof(name)) != ESP_OK) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing exercise name");
    return ESP_FAIL;
  }

  char name_value[128];
  if (httpd_query_key_value(name, "name", name_value, sizeof(name_value)) != ESP_OK) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing exercise name");
    return ESP_FAIL;
  }

  char name_decoded[128];
  url_decode(name_decoded, name_value);

  if (!exercises_remove(root, name_decoded)) {
    httpd_resp_send_err(req, HTTPD_404_NOT_FOUND, "Exercise not found");
    return ESP_FAIL;
  }

  /* Save */
  if (!exercises_save_to_file(root, "/cfg/config.json")) {
    ESP_LOGE("CONFIG", "Failed to save exercises");
  }

  httpd_resp_sendstr(req, "OK");
  return ESP_OK;
}

static esp_err_t captive_portal_handler(httpd_req_t *req) {
  // 302 redirect to ESP32 IP (AP IP)
  const char *location = "http://192.168.4.1/";
  httpd_resp_set_status(req, "302 Found");
  httpd_resp_set_hdr(req, "Location", location);
  httpd_resp_send(req, NULL, 0);

  ESP_LOGI("CAPTIVE", "Redirecting /generate_204 to %s", location);
  return ESP_OK;
}

static inline void print_help() {
  printf("Welcome to ESP-LIFT.\n\n"
         "1. Get system information\n"
         "2. Restart ESP\n"
         "3. Recalibrate encoders\n"
         "4. Cat /cfg/config.json\n");
}

static inline void monitor_system_info() {
  int flags = fcntl(STDIN_FILENO, F_GETFL, 0);
  fcntl(STDIN_FILENO, F_SETFL, flags | O_NONBLOCK);
  printf("Press CTRL+C to stop monitor\n\n\n\n");
  while (1) {
    multi_heap_info_t info;
    heap_caps_get_info(&info, MALLOC_CAP_DEFAULT);
    size_t total_storage, used_storage;
    ESP_ERROR_CHECK(esp_littlefs_info(CFG_PARTLABEL, &total_storage, &used_storage));

    double ram_used_kb = info.total_allocated_bytes / 1000.0;
    double ram_total_kb = ram_used_kb + (info.total_free_bytes / 1000.0);
    double storage_used_kb = used_storage / 1000.0;
    double storage_total_kb = total_storage / 1000.0;

    esp_log_level_set("*", ESP_LOG_NONE);
    printf(ANSI_CURSOR_UP(3) ANSI_CLEAR_LINE
           "(RAM) %.1f / %.1f kB | (Storage) %.1f / %.1f kB\n" ANSI_CLEAR_LINE
           "(Left encoder) raw_count: %ld, calibrated: %.1f, cal_done: %s\n" ANSI_CLEAR_LINE
           "(Right encoder) raw_count: %ld, calibrated: %.1f, cal_done: %s\n",
           ram_used_kb, ram_total_kb, storage_used_kb, storage_total_kb, leftEncoder->raw_count,
           leftEncoder->calibrated, leftEncoder->is_calibrated ? "yes" : "no",
           rightEncoder->raw_count, rightEncoder->calibrated,
           rightEncoder->is_calibrated ? "yes" : "no");
    fflush(stdout);

    int c = getchar();
    if (c == 0x03) { // CTRL+C
      printf("\nMonitor stopped.\n");
      break;
    }

    vTaskDelay(pdMS_TO_TICKS(300));
  }
  fcntl(STDIN_FILENO, F_SETFL, flags);
  esp_log_level_set("*", ESP_LOG_INFO);
}

static void input_task(void *arg) {
  print_help();
  while (1) {
    printf("> ");
    char option = getchar();
    printf("%c\n", option);
    switch (option) {
    case '1':
      monitor_system_info();
      break;
    case '2':
      ESP_LOGI("RESTART", "ESP restarting now...");
      vTaskDelay(pdMS_TO_TICKS(1000));
      esp_restart();
      break;
    case '3':
      encoder_reset_calibration(leftEncoder);
      encoder_reset_calibration(rightEncoder);
      break;
    case '4':
      FILE *f = fopen("/cfg/config.json", "r");
      if (!f) {
        ESP_LOGW("MAIN", "config.json does not exist or could not be opened");
        break;
      };
      int16_t c;
      while ((c = fgetc(f)) != EOF) {
        printf("%c", c);
      }
      fclose(f);
      break;

    default:
      print_help();
      break;
    }
  }
}

void app_main(void) {
  /* Blocking UART */
  ESP_ERROR_CHECK(uart_driver_install(CONFIG_CONSOLE_UART_NUM, 256, 0, 0, NULL, 0));
  uart_vfs_dev_use_driver(CONFIG_CONSOLE_UART_NUM);
  setvbuf(stdin, NULL, _IONBF, 0);
  setvbuf(stdout, NULL, _IONBF, 0);
  encoder_evt_queue = xQueueCreate(10, sizeof(encoder_event));

  leftEncoder = init_encoder(&(encoder_config) {.name = "left",
                                                .pin_a = GPIO_NUM_26,
                                                .pin_b = GPIO_NUM_25,
                                                .pin_z = GPIO_NUM_33,
                                                .callback = encoder_producer_callback});
  rightEncoder = init_encoder(&(encoder_config) {.name = "right",
                                                 .pin_a = GPIO_NUM_32,
                                                 .pin_b = GPIO_NUM_35,
                                                 .pin_z = GPIO_NUM_34,
                                                 .callback = encoder_producer_callback});

  /* FS */
  // Root
  ESP_ERROR_CHECK(
    esp_vfs_littlefs_register(&(esp_vfs_littlefs_conf_t) {.base_path = "/cfg",
                                                          .partition_label = CFG_PARTLABEL,
                                                          .format_if_mount_failed = false,
                                                          .dont_mount = false}));

  // Web app
  ESP_ERROR_CHECK(
    esp_vfs_littlefs_register(&(esp_vfs_littlefs_conf_t) {.base_path = "/www",
                                                          .partition_label = WWW_PARTLABEL,
                                                          .format_if_mount_failed = false,
                                                          .dont_mount = false,
                                                          .read_only = true}));

  /* Configuration from file */
  cJSON *config_cjson = exercises_load_from_file("/cfg/config.json");
  if (config_cjson == NULL) {
    ESP_LOGE("CONFIG", "Failed to load config");
    abort();
  }

  settings_t settings;
  config_load_settings(config_cjson, &settings);

  /* Wifi */
  wifi_config_t wifi_config = {0};

  strncpy((char *) wifi_config.sta.ssid, settings.ssid, sizeof(wifi_config.sta.ssid));

  strncpy((char *) wifi_config.sta.password, settings.password, sizeof(wifi_config.sta.password));

  wifi_config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
  wifi_config.sta.pmf_cfg.capable = true;
  wifi_config.sta.pmf_cfg.required = false;

  init_wifi(&wifi_config, settings.hostname);

  /* HTTP Server */
  httpd_handle_t server = NULL;
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();

  /* Captive portals */
  const char *captive_paths[] = {"/generate_204", "/fwlink", "/hotspot-detect.html", "/ncsi.txt",
                                 "/connecttest.txt"};

  size_t num_captive_paths = sizeof(captive_paths) / sizeof(captive_paths[0]);

  config.uri_match_fn = httpd_uri_match_wildcard;
  config.close_fn = client_close_handler;
  config.lru_purge_enable = true;
  config.keep_alive_enable = true;
  config.max_uri_handlers = num_captive_paths + 9;

  ESP_ERROR_CHECK(httpd_start(&server, &config));

  // Register each path in a loop
  for (size_t i = 0; i < num_captive_paths; i++) {
    httpd_uri_t *uri = malloc(sizeof(httpd_uri_t));
    if (!uri) {
      ESP_LOGE("HTTPD", "Failed to allocate memory for URI handler");
      continue;
    }

    *uri = (httpd_uri_t) {.uri = captive_paths[i],
                          .method = HTTP_GET,
                          .handler = captive_portal_handler,
                          .user_ctx = NULL};

    ESP_ERROR_CHECK(httpd_register_uri_handler(server, uri));
  }
  ESP_ERROR_CHECK(httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/ws",
                                                                     .method = HTTP_GET,
                                                                     .handler = ws_handler,
                                                                     .user_ctx = NULL,
                                                                     .is_websocket = true}));

  ESP_ERROR_CHECK(httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/restart",
                                                                     .method = HTTP_GET,
                                                                     .handler = restart_handler,
                                                                     .user_ctx = NULL}));

  ESP_ERROR_CHECK(httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/calibrate",
                                                                     .method = HTTP_GET,
                                                                     .handler = calibrate_handler,
                                                                     .user_ctx = NULL}));
  ESP_ERROR_CHECK(
    httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/exercises",
                                                       .method = HTTP_GET,
                                                       .handler = get_exercises_handler,
                                                       .user_ctx = (void *) config_cjson}));
  ESP_ERROR_CHECK(
    httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/exercises",
                                                       .method = HTTP_POST,
                                                       .handler = post_exercises_handler,
                                                       .user_ctx = (void *) config_cjson}));

  ESP_ERROR_CHECK(
    httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/exercises",
                                                       .method = HTTP_DELETE,
                                                       .handler = delete_exercises_handler,
                                                       .user_ctx = (void *) config_cjson}));

  ESP_ERROR_CHECK(
    httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/settings",
                                                       .method = HTTP_POST,
                                                       .handler = post_settings_handler,
                                                       .user_ctx = (void *) config_cjson}));

  ESP_ERROR_CHECK(httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "*",
                                                                     .method = HTTP_GET,
                                                                     .handler = path_handler,
                                                                     .user_ctx = (void *) "/www"}));

  /* Run tasks */
  xTaskCreate(encoder_consumer_task, "encoder_ws_task", 4096, server, 5, NULL);
  xTaskCreate(input_task, "input_task", 4096, NULL, tskIDLE_PRIORITY, NULL);

  while (1) {
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}