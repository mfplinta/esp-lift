#include <arpa/inet.h>
#include <dirent.h>
#include <driver/gpio.h>
#include <driver/uart.h>
#include <driver/uart_vfs.h>
#include <errno.h>
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

#include "data/encoder_cal.h"
#include "data/settings.h"
#include "network/wifi.h"

#define ENCODER_CAL_LEFT_PATH "/cfg/encoder_cal_left.json"
#define ENCODER_CAL_RIGHT_PATH "/cfg/encoder_cal_right.json"

#include "encoder.h"
#include "rep_counter.h"
#include "routes/api/http_api_exercises.h"
#include "routes/api/http_api_hardware.h"
#include "routes/api/http_api_settings.h"
#include "routes/captive/http_captiveportalredirect.h"
#include "routes/web/http_fileserver.h"
#include "routes/ws/ws_encoder.h"
#include "routes/ws/ws_rep_counter.h"
#include "tls_cert.h"
#include "transport/http/http_redirect_server.h"
#include "transport/http/https_server.h"
#include "transport/ws/ws_server.h"
#include "utils.h"

#define ANSI_CURSOR_UP(n) "\033[" #n "A"
#define ANSI_CLEAR_LINE "\033[2K\r"

const char *WWW_PARTLABEL = "www";
const char *CFG_PARTLABEL = "cfg";
const char *TAG = "MAIN";

static const char *const cal_state_names[] = {
  [CAL_IDLE] = "idle", [CAL_SEEK_MAX] = "seek_max", [CAL_DONE] = "done"};

static httpd_handle_t redirect_server = NULL;
encoder_t *leftEncoder = NULL;
encoder_t *rightEncoder = NULL;
encoder_state_t left_cal_state = {0};
encoder_state_t right_cal_state = {0};
static rep_counter_t rep_counter;
static ws_encoder_context_t ws_encoder_ctx;

static void register_http_handlers(httpd_handle_t http_server, void *ctx) {
  (void) ctx;
  http_api_hardware_register(http_server);
  http_api_exercises_register(http_server, "/cfg/exercises.json");
  http_api_settings_register(http_server, "/cfg/settings.json");
  http_captiveportalredirect_register(http_server);
  ws_register(http_server);

  http_fileserver_register(http_server, "/www");
}

static void handle_sta_ip_change(const char *new_ip) {
  if (!new_ip || new_ip[0] == '\0') return;
  https_server_request_tls_update(wifi_get_ap_ip(), new_ip);
}

void app_hostname_changed(const char *hostname) {
  tls_cert_set_hostname(hostname);
  https_server_request_tls_update(wifi_get_ap_ip(), wifi_get_sta_ip());
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

  if (event->type == EVENT_CALIBRATION_CHANGE && event->source->state.cal_state == CAL_DONE) {
    const char *cal_path =
      (event->source == leftEncoder) ? ENCODER_CAL_LEFT_PATH : ENCODER_CAL_RIGHT_PATH;
    encoder_state_t snapshot = event->source->state;
    esp_err_t err = encoder_cal_save_file(cal_path, &snapshot);
    if (err != ESP_OK) {
      ESP_LOGE(TAG, "Failed to save %s encoder calibration", encoder_name);
    } else {
      ESP_LOGI(TAG, "Saved %s encoder calibration", encoder_name);
    }
  }

  ws_encoder_publish(&ws_encoder_ctx, "position", encoder_name, event->source,
                     cal_state_names[event->source->state.cal_state]);

  if (has_side) {
    bool rep_completed = rep_counter_check(&rep_counter, side, event->source->state.calibrated,
                                           event->source->state.cal_state);
    if (rep_completed) {
      ws_encoder_publish(&ws_encoder_ctx, "rep", encoder_name, event->source,
                         cal_state_names[event->source->state.cal_state]);
    }
  }
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
      ws_encoder_publish(&ws_encoder_ctx, "rep", "left", leftEncoder,
                         cal_state_names[leftEncoder->state.cal_state]);
    } else if (c == 'k') {
      ws_encoder_publish(&ws_encoder_ctx, "rep", "right", rightEncoder,
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
  encoder_cal_load_file(ENCODER_CAL_LEFT_PATH, &left_cal_state);
  encoder_cal_load_file(ENCODER_CAL_RIGHT_PATH, &right_cal_state);
  leftEncoder = init_encoder(
    (encoder_config_t) {.pin_a = GPIO_NUM_11,
                        .pin_b = GPIO_NUM_10,
                        .pin_z = GPIO_NUM_9,
                        .debounce_interval = settings.debounce_interval,
                        .calibration_debounce_steps = settings.calibration_debounce_steps,
                        .on_event_cb = encoder_event_handler},
    &left_cal_state);
  rightEncoder = init_encoder(
    (encoder_config_t) {.pin_a = GPIO_NUM_14,
                        .pin_b = GPIO_NUM_13,
                        .pin_z = GPIO_NUM_12,
                        .debounce_interval = settings.debounce_interval,
                        .calibration_debounce_steps = settings.calibration_debounce_steps,
                        .on_event_cb = encoder_event_handler},
    &right_cal_state);

  http_api_hardware_init(leftEncoder, rightEncoder);
  ws_encoder_init(&ws_encoder_ctx, leftEncoder, rightEncoder);

  rep_counter_init(&rep_counter);
  ws_subscribe_message(ws_rep_counter_handle_message, &rep_counter);

  /* HTTP(S) Server */
  https_server_config_t https_config = {.max_uri_handlers = get_captive_paths_count() + 10};
  ESP_ERROR_CHECK(https_server_start(&https_config, register_http_handlers, NULL));
  http_redirect_server_config_t redirect_config = {.target_fn = captiveportal_fallback_target,
                                                   .target_ctx = NULL,
                                                   .fallback_target = NULL,
                                                   .log_tag = "HTTP_REDIRECT",
                                                   .path = "/*",
                                                   .status_code = 301,
                                                   .server_port = 80,
                                                   .max_uri_handlers = 4,
                                                   .lru_purge_enable = true,
                                                   .keep_alive_enable = true};
  ESP_ERROR_CHECK(http_redirect_server_start(&redirect_server, &redirect_config));

  /* Run tasks */
  xTaskCreate(input_task, "input_task", 4096, NULL, tskIDLE_PRIORITY, NULL);

  while (1) {
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}