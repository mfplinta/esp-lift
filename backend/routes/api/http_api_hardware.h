#ifndef HTTP_API_HARDWARE_H
#define HTTP_API_HARDWARE_H

#include <esp_http_server.h>
#include <esp_log.h>
#include <esp_system.h>

#include "../../encoder.h"
#include "../../utils.h"

typedef struct {
  encoder_t *left_encoder;
  encoder_t *right_encoder;
} http_api_hardware_context_t;

static http_api_hardware_context_t http_api_hardware_context = {0};

esp_err_t calibrate_handler(httpd_req_t *req);
esp_err_t calibrate_zero_handler(httpd_req_t *req);
esp_err_t restart_handler(httpd_req_t *req);

void http_api_hardware_init(encoder_t *left_encoder, encoder_t *right_encoder) {
  http_api_hardware_context.left_encoder = left_encoder;
  http_api_hardware_context.right_encoder = right_encoder;
}

void http_api_hardware_register(httpd_handle_t server) {
  ESP_ERROR_CHECK(httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/api/calibrate",
                                                                     .method = HTTP_GET,
                                                                     .handler = calibrate_handler,
                                                                     .user_ctx = &http_api_hardware_context}));
  ESP_ERROR_CHECK(httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/api/calibrate/zero",
                                                                     .method = HTTP_GET,
                                                                     .handler = calibrate_zero_handler,
                                                                     .user_ctx = &http_api_hardware_context}));
  ESP_ERROR_CHECK(httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/api/restart",
                                                                     .method = HTTP_GET,
                                                                     .handler = restart_handler,
                                                                     .user_ctx = &http_api_hardware_context}));
}

esp_err_t calibrate_handler(httpd_req_t *req) {
  http_api_hardware_context_t *ctx = (http_api_hardware_context_t *) req->user_ctx;
  httpd_log_request(req, "HTTP_API_HARDWARE");

  if (!ctx || !ctx->left_encoder || !ctx->right_encoder) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Encoders are not initialized");
    return ESP_FAIL;
  }

  encoder_reset_calibration(ctx->left_encoder);
  encoder_reset_calibration(ctx->right_encoder);
  httpd_resp_send(req, "Clearing calibration...", HTTPD_RESP_USE_STRLEN);
  return ESP_OK;
}

esp_err_t calibrate_zero_handler(httpd_req_t *req) {
  http_api_hardware_context_t *ctx = (http_api_hardware_context_t *) req->user_ctx;
  httpd_log_request(req, "HTTP_API_HARDWARE");

  if (!ctx || !ctx->left_encoder || !ctx->right_encoder) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Encoders are not initialized");
    return ESP_FAIL;
  }

  encoder_zero_calibrated(ctx->left_encoder);
  encoder_zero_calibrated(ctx->right_encoder);
  httpd_resp_send(req, "Zeroed calibrated position...", HTTPD_RESP_USE_STRLEN);
  return ESP_OK;
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
