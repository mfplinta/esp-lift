#ifndef HTTP_API_SETTINGS_H
#define HTTP_API_SETTINGS_H

#include "../utils.h"
#include <cJSON.h>
#include <esp_http_server.h>
#include <esp_log.h>

esp_err_t post_settings_handler(httpd_req_t *req);

void http_api_settings_register(httpd_handle_t server, const char *settings_json) {
  ESP_ERROR_CHECK(
    httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/api/settings",
                                                       .method = HTTP_POST,
                                                       .handler = post_settings_handler,
                                                       .user_ctx = (void *) settings_json}));
}

esp_err_t post_settings_handler(httpd_req_t *req) {
  ESP_LOGI("HTTP_API_HARDWARE", "POST: %s", req->uri);
  esp_err_t res = ESP_FAIL;

  cJSON *req_json = httpd_read_json_body(req);

  char *settings_json_file = (char *) req->user_ctx;
  cJSON *settings_json = cjson_read_from_file(settings_json_file);

  if (!req_json) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid JSON");
    return ESP_FAIL;
  }

  /* -------- WIFI -------- */
  const cJSON *wifi = cJSON_GetObjectItemCaseSensitive(req_json, "wifi");
  if (cJSON_IsObject(wifi)) {
    cJSON *dst = cJSON_GetObjectItem(settings_json, "wifi");

    cJSON *item;
    if ((item = cJSON_GetObjectItem(wifi, "ssid")))
      cJSON_ReplaceItemInObject(dst, "ssid", cJSON_Duplicate(item, 1));

    if ((item = cJSON_GetObjectItem(wifi, "password")))
      cJSON_ReplaceItemInObject(dst, "password", cJSON_Duplicate(item, 1));

    if ((item = cJSON_GetObjectItem(wifi, "hostname")))
      cJSON_ReplaceItemInObject(dst, "hostname", cJSON_Duplicate(item, 1));
  }

  /* Persist */
  if (!cjson_save_to_file(settings_json, settings_json_file)) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to save settings on server");
    goto cleanup;
  }

  httpd_resp_sendstr(req, "OK");

cleanup:
  cJSON_Delete(req_json);
  cJSON_Delete(settings_json);
  return res;
}

#endif