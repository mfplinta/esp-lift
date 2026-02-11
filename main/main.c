#include <arpa/inet.h>
#include <dirent.h>
#include <driver/gpio.h>
#include <driver/uart.h>
#include <driver/uart_vfs.h>
#include <esp_attr.h>
#include <esp_http_server.h>
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
#include "handlers/ws.h"
#include "rep_counter.h"
#include "utils.h"
#include "wifi.h"

#define ANSI_CURSOR_UP(n) "\033[" #n "A"
#define ANSI_CLEAR_LINE "\033[2K\r"

const char *WWW_PARTLABEL = "www";
const char *CFG_PARTLABEL = "cfg";
const char *TAG = "MAIN";

static const char *const cal_state_names[] = {
  [CAL_IDLE] = "idle", [CAL_SEEK_MAX] = "seek_max", [CAL_DONE] = "done"};

httpd_handle_t server = NULL;
encoder_t *leftEncoder = NULL;
encoder_t *rightEncoder = NULL;
static rep_counter_t rep_counter;
static int32_t last_left_calibrated_sent = -1;
static int32_t last_right_calibrated_sent = -1;

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

  /* HTTP Server */
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();

  config.uri_match_fn = httpd_uri_match_wildcard;
  config.lru_purge_enable = true;
  config.keep_alive_enable = true;
  config.max_uri_handlers = get_captive_paths_count() + 9;

  ESP_ERROR_CHECK(httpd_start(&server, &config));
  http_api_hardware_register(server);
  http_api_exercises_register(server, "/cfg/exercises.json");
  http_api_settings_register(server, "/cfg/settings.json");
  http_captiveportalredirect_register(server);
  ws_register(server);

  ESP_ERROR_CHECK(httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/api/calibrate",
                                                                     .method = HTTP_GET,
                                                                     .handler = calibrate_handler,
                                                                     .user_ctx = NULL}));

  // Wildcard
  http_fileserver_register(server, "/www");

  /* Run tasks */
  xTaskCreate(input_task, "input_task", 4096, NULL, tskIDLE_PRIORITY, NULL);

  while (1) {
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}