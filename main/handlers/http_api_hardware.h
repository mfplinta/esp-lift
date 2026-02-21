#ifndef HTTP_API_HARDWARE_H
#define HTTP_API_HARDWARE_H

#include <esp_log.h>
#include <esp_system.h>
#include <esp_http_server.h>

#include "../utils.h"

esp_err_t restart_handler(httpd_req_t *req);

void http_api_hardware_register(httpd_handle_t server) {
  ESP_ERROR_CHECK(httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/api/restart",
                                                                     .method = HTTP_GET,
                                                                     .handler = restart_handler,
                                                                     .user_ctx = NULL}));
}

esp_err_t restart_handler(httpd_req_t *req) {
  httpd_log_request(req, "HTTP_API_HARDWARE");
  httpd_resp_send(req, "Restarting device...\n", HTTPD_RESP_USE_STRLEN);

  ESP_LOGI("HTTP_API_HARDWARE", "ESP restarting now...");
  vTaskDelay(pdMS_TO_TICKS(1000));

  esp_restart();
  return ESP_OK;
}

#endif