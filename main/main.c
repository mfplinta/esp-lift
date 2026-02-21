#include <arpa/inet.h>
#include <dirent.h>
#include <driver/gpio.h>
#include <driver/uart.h>
#include <driver/uart_vfs.h>
#include <esp_attr.h>
#include <esp_http_server.h>
#include <esp_https_server.h>
#include <esp_littlefs.h>
#include <esp_log.h>
#include <esp_system.h>
#include <fcntl.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include <math.h>
#include <netinet/in.h>
#include <portmacro.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>

#include "data/settings.h"
#include "encoder.h"
#include "handlers/http_api_exercises.h"
#include "handlers/http_api_hardware.h"
#include "handlers/http_api_settings.h"
#include "handlers/http_captiveportalredirect.h"
#include "handlers/http_fileserver.h"
#include "handlers/http_redirect.h"
#include "handlers/ws.h"
#include "rep_counter.h"
#include "tls_cert.h"
#include "utils.h"
#include "wifi.h"

#define ANSI_CURSOR_UP(n) "\033[" #n "A"
#define ANSI_CLEAR_LINE "\033[2K\r"

const char *WWW_PARTLABEL = "www";
const char *CFG_PARTLABEL = "cfg";
const char *TAG = "MAIN";

static const char *const cal_state_names[] = {
  [CAL_IDLE] = "idle", [CAL_SEEK_MAX] = "seek_max", [CAL_DONE] = "done"};

static esp_err_t calibrate_handler(httpd_req_t *req);
static void restart_https_server(void);

httpd_handle_t server = NULL;
static httpd_handle_t redirect_server = NULL;
static tls_cert_bundle_t https_bundle = {0};
encoder_t *leftEncoder = NULL;
encoder_t *rightEncoder = NULL;
static rep_counter_t rep_counter;
static int32_t last_left_calibrated_sent = -1;
static int32_t last_right_calibrated_sent = -1;

#define TLS_CERT_TASK_STACK 8192

typedef struct {
  char ap_ip[16];
  char sta_ip[16];
  TaskHandle_t notify_task;
  esp_err_t result;
} tls_cert_task_args_t;

typedef struct {
  char ap_ip[16];
  char sta_ip[16];
} tls_update_args_t;

static TaskHandle_t tls_update_task_handle = NULL;

static void tls_cert_task(void *param) {
  tls_cert_task_args_t *args = (tls_cert_task_args_t *) param;
  const char *ap_ip = args->ap_ip[0] ? args->ap_ip : NULL;
  const char *sta_ip = args->sta_ip[0] ? args->sta_ip : NULL;

  tls_cert_free(&https_bundle);
  args->result = tls_cert_ensure(ap_ip, sta_ip, &https_bundle);

  xTaskNotifyGive(args->notify_task);
  vTaskDelete(NULL);
}

static void tls_update_task(void *param) {
  tls_update_args_t *args = (tls_update_args_t *) param;
  const char *ap_ip = args->ap_ip[0] ? args->ap_ip : NULL;
  const char *sta_ip = args->sta_ip[0] ? args->sta_ip : NULL;

  esp_err_t err = tls_cert_regenerate(ap_ip, sta_ip);

  if (err == ESP_OK) {
    restart_https_server();
  } else {
    ESP_LOGE(TAG, "TLS cert regeneration failed");
  }

  tls_update_task_handle = NULL;
  free(args);
  vTaskDelete(NULL);
}

static void request_tls_update(const char *ap_ip, const char *sta_ip) {
  if (tls_update_task_handle) {
    ESP_LOGW(TAG, "TLS update already running");
    return;
  }

  tls_update_args_t *args = calloc(1, sizeof(tls_update_args_t));
  if (!args) {
    ESP_LOGE(TAG, "Failed to allocate TLS update args");
    return;
  }

  if (ap_ip) {
    strncpy(args->ap_ip, ap_ip, sizeof(args->ap_ip));
    args->ap_ip[sizeof(args->ap_ip) - 1] = '\0';
  }
  if (sta_ip) {
    strncpy(args->sta_ip, sta_ip, sizeof(args->sta_ip));
    args->sta_ip[sizeof(args->sta_ip) - 1] = '\0';
  }

  BaseType_t created = xTaskCreate(tls_update_task, "tls_update", TLS_CERT_TASK_STACK, args,
                                   tskIDLE_PRIORITY + 1, &tls_update_task_handle);
  if (created != pdPASS) {
    tls_update_task_handle = NULL;
    free(args);
    ESP_LOGE(TAG, "Failed to create TLS update task");
  }
}

static void ws_send_encoder_event(const char *event_type, const char *encoder_name,
                                  encoder_t *encoder, const char *cal_state_name) {
  char rx_buffer[160];

  int32_t calibrated_int = (int32_t) ceil(encoder->state.calibrated);
  if (calibrated_int < 0) calibrated_int = 0;
  if (calibrated_int > 100) calibrated_int = 100;

  if (strcmp(event_type, "position") == 0) {
    int32_t *last_sent = NULL;
    if (encoder == leftEncoder) {
      last_sent = &last_left_calibrated_sent;
    } else if (encoder == rightEncoder) {
      last_sent = &last_right_calibrated_sent;
    }

    if (last_sent && *last_sent == calibrated_int) {
      return;
    }

    if (last_sent) {
      *last_sent = calibrated_int;
    }
  }

  snprintf(rx_buffer, sizeof(rx_buffer),
           "{\"event\": \"%s\", \"name\": \"%s\", \"calibrated\": %ld, "
           "\"cal_state\": \"%s\"}",
           event_type, encoder_name, (long) calibrated_int, cal_state_name);

  resp_arg_t *resp_arg;
  if (!(resp_arg = malloc(sizeof(resp_arg_t)))) {
    ESP_LOGE(TAG, "Could not allocate for response");
    return;
  }

  resp_arg->hd = server;
  resp_arg->data = strdup(rx_buffer);

  ws_send_message(resp_arg);
}

static const char *redirect_fallback_target(void *ctx) {
  (void) ctx;
  const char *hostname = tls_cert_get_hostname();
  return (hostname && hostname[0]) ? hostname : wifi_get_ap_ip();
}

static void register_http_handlers(httpd_handle_t http_server) {
  http_api_hardware_register(http_server);
  http_api_exercises_register(http_server, "/cfg/exercises.json");
  http_api_settings_register(http_server, "/cfg/settings.json");
  http_captiveportalredirect_register(http_server);
  ws_register(http_server);

  ESP_ERROR_CHECK(
    httpd_register_uri_handler(http_server, &(httpd_uri_t) {.uri = "/api/calibrate",
                                                            .method = HTTP_GET,
                                                            .handler = calibrate_handler,
                                                            .user_ctx = NULL}));

  http_fileserver_register(http_server, "/www");
}

static esp_err_t start_https_server(void) {
  tls_cert_task_args_t *args = calloc(1, sizeof(tls_cert_task_args_t));
  if (!args) {
    ESP_LOGE(TAG, "Failed to allocate TLS cert task args");
    return ESP_ERR_NO_MEM;
  }

  const char *ap_ip = wifi_get_ap_ip();
  const char *sta_ip = wifi_get_sta_ip();
  if (ap_ip) {
    strncpy(args->ap_ip, ap_ip, sizeof(args->ap_ip));
    args->ap_ip[sizeof(args->ap_ip) - 1] = '\0';
  }
  if (sta_ip) {
    strncpy(args->sta_ip, sta_ip, sizeof(args->sta_ip));
    args->sta_ip[sizeof(args->sta_ip) - 1] = '\0';
  }

  args->notify_task = xTaskGetCurrentTaskHandle();

  BaseType_t created =
    xTaskCreate(tls_cert_task, "tls_cert", TLS_CERT_TASK_STACK, args, tskIDLE_PRIORITY + 1, NULL);
  if (created != pdPASS) {
    free(args);
    ESP_LOGE(TAG, "Failed to create TLS cert task");
    return ESP_FAIL;
  }

  ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

  esp_err_t err = args->result;
  free(args);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "Failed to load HTTPS certificate");
    return err;
  }

  httpd_ssl_config_t config = HTTPD_SSL_CONFIG_DEFAULT();
  config.httpd.uri_match_fn = httpd_uri_match_wildcard;
  config.httpd.lru_purge_enable = true;
  config.httpd.keep_alive_enable = true;
  config.httpd.max_uri_handlers = get_captive_paths_count() + 9;
  config.httpd.server_port = 443;
  config.servercert = (const unsigned char *) https_bundle.cert_pem;
  config.servercert_len = https_bundle.cert_len;
  config.prvtkey_pem = (const unsigned char *) https_bundle.key_pem;
  config.prvtkey_len = https_bundle.key_len;

  err = httpd_ssl_start(&server, &config);
  if (err != ESP_OK) return err;

  register_http_handlers(server);
  return ESP_OK;
}

static esp_err_t start_http_redirect_server(void) {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.uri_match_fn = httpd_uri_match_wildcard;
  config.lru_purge_enable = true;
  config.keep_alive_enable = true;
  config.max_uri_handlers = 4;
  config.server_port = 80;

  esp_err_t err = httpd_start(&redirect_server, &config);
  if (err != ESP_OK) return err;

  static http_redirect_config_t redirect_config = {.target_fn = redirect_fallback_target,
                                                   .target_ctx = NULL,
                                                   .fallback_target = NULL,
                                                   .log_tag = "HTTP_REDIRECT",
                                                   .path = "/*",
                                                   .status_code = 301};

  ESP_ERROR_CHECK(http_redirect_register(redirect_server, &redirect_config));

  return ESP_OK;
}

static void restart_https_server(void) {
  if (server) {
    httpd_ssl_stop(server);
    server = NULL;
  }
  if (start_https_server() != ESP_OK) {
    ESP_LOGE(TAG, "Failed to restart HTTPS server");
  }
}

static void handle_sta_ip_change(const char *new_ip) {
  if (!new_ip || new_ip[0] == '\0') return;
  request_tls_update(wifi_get_ap_ip(), new_ip);
}

void app_hostname_changed(const char *hostname) {
  tls_cert_set_hostname(hostname);
  request_tls_update(wifi_get_ap_ip(), wifi_get_sta_ip());
}

static void encoder_event_handler(encoder_event_t *event) {
  char *encoder_name;
  rep_side_t side;
  bool has_side = true;

  if (event->source == leftEncoder) {
    encoder_name = "left";
    side = REP_SIDE_LEFT;
  } else if (event->source == rightEncoder) {
    encoder_name = "right";
    side = REP_SIDE_RIGHT;
  } else {
    encoder_name = "unknown";
    has_side = false;
  }

  ws_send_encoder_event("position", encoder_name, event->source,
                        cal_state_names[event->source->state.cal_state]);

  if (has_side) {
    bool rep_completed = rep_counter_check(&rep_counter, side, event->source->state.calibrated,
                                           event->source->state.cal_state);
    if (rep_completed) {
      ws_send_encoder_event("rep", encoder_name, event->source,
                            cal_state_names[event->source->state.cal_state]);
    }
  }
}

esp_err_t calibrate_handler(httpd_req_t *req) {
  httpd_log_request(req, "HTTP_API_HARDWARE");
  if (leftEncoder == NULL || rightEncoder == NULL) httpd_resp_send_err(req, 400, "");
  encoder_reset_calibration(leftEncoder);
  encoder_reset_calibration(rightEncoder);
  httpd_resp_send(req, "Clearing calibration...", HTTPD_RESP_USE_STRLEN);
  return ESP_OK;
}

static inline void monitor_system_info() {
  int flags = fcntl(STDIN_FILENO, F_GETFL, 0);
  fcntl(STDIN_FILENO, F_SETFL, flags | O_NONBLOCK);
  printf("CTRL+C: stop monitor | j: left rep | k: right rep\n\n\n\n");
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
           "(Left encoder) raw_count: %ld, calibrated: %.1f, cal_done: %s, debounce_ms: "
           "%d\n" ANSI_CLEAR_LINE
           "(Right encoder) raw_count: %ld, calibrated: %.1f, cal_done: %s, debounce_ms: %d\n",
           ram_used_kb, ram_total_kb, storage_used_kb, storage_total_kb,
           leftEncoder->state.raw_count, leftEncoder->state.calibrated,
           leftEncoder->state.cal_state == CAL_DONE ? "yes" : "no",
           leftEncoder->config.debounce_interval, rightEncoder->state.raw_count,
           rightEncoder->state.calibrated, rightEncoder->state.cal_state == CAL_DONE ? "yes" : "no",
           rightEncoder->config.debounce_interval);
    fflush(stdout);

    int c = getchar();
    if (c == 0x03) { // CTRL+C
      printf("\nMonitor stopped.\n");
      break;
    } else if (c == 'r') {
      encoder_reset_calibration(leftEncoder);
      encoder_reset_calibration(rightEncoder);
      printf("\nCalibration cleared.\n");
    } else if (c == 'j') {
      ws_send_encoder_event("rep", "left", leftEncoder,
                            cal_state_names[leftEncoder->state.cal_state]);
    } else if (c == 'k') {
      ws_send_encoder_event("rep", "right", rightEncoder,
                            cal_state_names[rightEncoder->state.cal_state]);
    }

    vTaskDelay(pdMS_TO_TICKS(300));
  }
  fcntl(STDIN_FILENO, F_SETFL, flags);
  esp_log_level_set("*", ESP_LOG_INFO);
}

static inline void print_help() {
  printf("Welcome to ESP-LIFT.\n\n"
         "1. Get system information\n"
         "2. Restart ESP\n"
         "3. List dir\n"
         "4. Cat file\n");
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
      char ls_path[50];
      printf("(no echo) ls: ");
      scanf("%49s%*c", ls_path);
      printf("\n");
      DIR *d = opendir(ls_path);
      if (d) {
        struct dirent *dir;
        while ((dir = readdir(d)) != NULL) {
          printf("%s\n", dir->d_name);
        }
        closedir(d);
      } else {
        ESP_LOGW("MAIN", "%s does not exist or could not be opened", ls_path);
      }
      break;
    case '4':
      char cat_path[50];
      printf("(no echo) cat: ");
      scanf("%49s%*c", cat_path);
      printf("\n");
      FILE *f = fopen(cat_path, "r");
      if (!f) {
        ESP_LOGW("MAIN", "%s does not exist or could not be opened", cat_path);
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
  cJSON *config_cjson = cjson_read_from_file("/cfg/settings.json");
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
  wifi_set_sta_ip_change_cb(handle_sta_ip_change);
  tls_cert_set_hostname(settings.hostname);

  /* Encoders */
  leftEncoder = init_encoder(
    (encoder_config_t) {.pin_a = GPIO_NUM_26,
                        .pin_b = GPIO_NUM_25,
                        .pin_z = GPIO_NUM_33,
                        .debounce_interval = settings.debounce_interval,
                        .calibration_debounce_steps = settings.calibration_debounce_steps,
                        .on_event_cb = encoder_event_handler});
  rightEncoder = init_encoder(
    (encoder_config_t) {.pin_a = GPIO_NUM_32,
                        .pin_b = GPIO_NUM_35,
                        .pin_z = GPIO_NUM_34,
                        .debounce_interval = settings.debounce_interval,
                        .calibration_debounce_steps = settings.calibration_debounce_steps,
                        .on_event_cb = encoder_event_handler});

  rep_counter_init(&rep_counter);
  ws_subscribe_message(rep_counter_handle_ws_message, &rep_counter);

  /* HTTP(S) Server */
  ESP_ERROR_CHECK(start_https_server());
  ESP_ERROR_CHECK(start_http_redirect_server());

  /* Run tasks */
  xTaskCreate(input_task, "input_task", 4096, NULL, tskIDLE_PRIORITY, NULL);

  while (1) {
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}