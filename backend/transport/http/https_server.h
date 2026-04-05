#ifndef HTTPS_SERVER_H
#define HTTPS_SERVER_H

#include <esp_https_server.h>
#include <esp_log.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <stdlib.h>
#include <string.h>

#include "../../network/wifi.h"
#include "../../tls_cert.h"

#define HTTPS_SERVER_TASK_STACK 8192

static const char *TAG_HTTPS = "HTTPS_SERVER";

typedef void (*https_server_register_handlers_fn)(httpd_handle_t server, void *ctx);

typedef struct {
  size_t max_uri_handlers;
} https_server_config_t;

typedef struct {
  char ap_ip[16];
  char sta_ip[16];
} tls_update_args_t;

static httpd_handle_t https_server = NULL;
static tls_cert_bundle_t https_bundle = {0};
static TaskHandle_t tls_update_task_handle = NULL;
static https_server_register_handlers_fn register_handlers_cb = NULL;
static void *register_handlers_ctx = NULL;
static https_server_config_t https_server_config = {0};

static esp_err_t https_server_restart(void);

static void tls_update_task(void *param) {
  tls_update_args_t *args = (tls_update_args_t *) param;
  const char *ap_ip = args->ap_ip[0] ? args->ap_ip : NULL;
  const char *sta_ip = args->sta_ip[0] ? args->sta_ip : NULL;

  esp_err_t err = tls_cert_regenerate(ap_ip, sta_ip);

  if (err == ESP_OK) {
    err = https_server_restart();
  }

  if (err != ESP_OK) {
    ESP_LOGE(TAG_HTTPS, "TLS update failed");
  }

  tls_update_task_handle = NULL;
  free(args);
  vTaskDelete(NULL);
}

esp_err_t https_server_start(const https_server_config_t *config,
                             https_server_register_handlers_fn register_handlers, void *ctx) {
  const char *ap_ip = wifi_get_ap_ip();
  const char *sta_ip = wifi_get_sta_ip();

  register_handlers_cb = register_handlers;
  register_handlers_ctx = ctx;
  if (config) {
    https_server_config = *config;
  } else {
    memset(&https_server_config, 0, sizeof(https_server_config));
  }

  tls_cert_free(&https_bundle);
  esp_err_t err = tls_cert_ensure(ap_ip, sta_ip, &https_bundle);
  if (err != ESP_OK) {
    ESP_LOGE(TAG_HTTPS, "Failed to load HTTPS certificate");
    return err;
  }

  httpd_ssl_config_t server_config = HTTPD_SSL_CONFIG_DEFAULT();
  server_config.httpd.uri_match_fn = httpd_uri_match_wildcard;
  server_config.httpd.lru_purge_enable = true;
  server_config.httpd.max_open_sockets = 16;
  server_config.httpd.max_uri_handlers =
    https_server_config.max_uri_handlers ? https_server_config.max_uri_handlers : 8;
  server_config.httpd.server_port = 443;
  server_config.session_tickets = true;
  server_config.servercert = (const unsigned char *) https_bundle.cert_pem;
  server_config.servercert_len = https_bundle.cert_len;
  server_config.prvtkey_pem = (const unsigned char *) https_bundle.key_pem;
  server_config.prvtkey_len = https_bundle.key_len;

  err = httpd_ssl_start(&https_server, &server_config);
  if (err != ESP_OK) return err;

  if (register_handlers_cb) {
    register_handlers_cb(https_server, register_handlers_ctx);
  }

  return ESP_OK;
}

static esp_err_t https_server_restart(void) {
  if (https_server) {
    httpd_ssl_stop(https_server);
    https_server = NULL;
  }

  if (https_server_start(&https_server_config, register_handlers_cb, register_handlers_ctx) != ESP_OK) {
    ESP_LOGE(TAG_HTTPS, "Failed to restart HTTPS server");
    return ESP_FAIL;
  }

  return ESP_OK;
}

void https_server_request_tls_update(const char *ap_ip, const char *sta_ip) {
  if (tls_update_task_handle) {
    ESP_LOGW(TAG_HTTPS, "TLS update already running");
    return;
  }

  tls_update_args_t *args = calloc(1, sizeof(tls_update_args_t));
  if (!args) {
    ESP_LOGE(TAG_HTTPS, "Failed to allocate TLS update args");
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

  BaseType_t created = xTaskCreate(tls_update_task, "tls_update", HTTPS_SERVER_TASK_STACK, args,
                                   tskIDLE_PRIORITY + 1, &tls_update_task_handle);
  if (created != pdPASS) {
    tls_update_task_handle = NULL;
    free(args);
    ESP_LOGE(TAG_HTTPS, "Failed to create TLS update task");
  }
}

httpd_handle_t https_server_get_handle(void) { return https_server; }

#endif
