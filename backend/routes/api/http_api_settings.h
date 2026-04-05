#ifndef HTTP_API_SETTINGS_H
#define HTTP_API_SETTINGS_H

#include "../../store/settings_store.h"
#include "../../utils.h"
#include <cJSON.h>
#include <esp_http_server.h>
#include <esp_log.h>
#include <stdbool.h>
#include <string.h>

esp_err_t get_settings_handler(httpd_req_t *req);
esp_err_t post_settings_handler(httpd_req_t *req);
void app_hostname_changed(const char *hostname);

void http_api_settings_register(httpd_handle_t server, const char *settings_json) {
  ESP_ERROR_CHECK(
    httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/api/settings",
                                                       .method = HTTP_GET,
                                                       .handler = get_settings_handler,
                                                       .user_ctx = (void *) settings_json}));
  ESP_ERROR_CHECK(
    httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/api/settings",
                                                       .method = HTTP_POST,
                                                       .handler = post_settings_handler,
                                                       .user_ctx = (void *) settings_json}));
}

esp_err_t get_settings_handler(httpd_req_t *req) {
  httpd_log_request(req, "HTTP_API_SETTINGS");
  char *json_string = NULL;

  if (settings_store_load_public_json((char *) req->user_ctx, &json_string) != EXIT_SUCCESS) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to sanitize settings");
    return ESP_FAIL;
  }

  httpd_resp_set_type(req, "application/json");
  esp_err_t res = httpd_resp_send(req, json_string, HTTPD_RESP_USE_STRLEN);
  if(json_string) free(json_string);
  return res;
}

esp_err_t post_settings_handler(httpd_req_t *req) {
  httpd_log_request(req, "HTTP_API_SETTINGS");
  esp_err_t res = ESP_FAIL;

  cJSON *req_json = NULL;
  char new_hostname[64];
  bool hostname_changed = false;

  if (!(req_json = httpd_read_json_body(req))) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid JSON");
    goto cleanup;
  }

  if (settings_store_apply_patch((char *) req->user_ctx, req_json, &hostname_changed, new_hostname,
                                 sizeof(new_hostname)) != EXIT_SUCCESS) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to parse settings request");
    goto cleanup;
  }

  httpd_resp_sendstr(req, "OK");
  res = ESP_OK;

  if (hostname_changed) {
    app_hostname_changed(new_hostname);
  }

cleanup:
  if(req_json) cJSON_Delete(req_json);
  return res;
}

#endif
