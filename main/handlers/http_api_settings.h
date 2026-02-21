#ifndef HTTP_API_SETTINGS_H
#define HTTP_API_SETTINGS_H

#include "../data/settings.h"
#include "../utils.h"
#include <cJSON.h>
#include <esp_http_server.h>
#include <esp_log.h>
#include <stdbool.h>
#include <string.h>

esp_err_t get_settings_handler(httpd_req_t *req);
esp_err_t post_settings_handler(httpd_req_t *req);
void app_hostname_changed(const char *hostname);

static inline void extract_hostname(cJSON *settings_json, char *out, size_t out_len) {
  if (!out || out_len == 0) return;
  out[0] = '\0';

  cJSON *network = cJSON_GetObjectItem(settings_json, "network");
  cJSON *hostname = network ? cJSON_GetObjectItem(network, "hostname") : NULL;
  const char *value = cJSON_IsString(hostname) ? hostname->valuestring : DEFAULT_HOSTNAME;

  strncpy(out, value, out_len);
  out[out_len - 1] = '\0';
}

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
  esp_err_t res = ESP_FAIL;

  char *settings_json_file = (char *) req->user_ctx;
  cJSON *json = cjson_read_from_file(settings_json_file);
  char *json_string = NULL;

  if (json == NULL) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to load config");
    goto cleanup;
  }

  /* Remove sensitive */
  if(config_sanitize_settings(json)) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to sanitize settings");
    goto cleanup;
  }

  if ((json_string = cJSON_PrintUnformatted(json)) == NULL) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to serialize JSON");
    goto cleanup;
  }

  httpd_resp_set_type(req, "application/json");
  res = httpd_resp_send(req, json_string, HTTPD_RESP_USE_STRLEN);

cleanup:
  if(json) cJSON_Delete(json);
  if(json_string) free(json_string);
  return res;
}

esp_err_t post_settings_handler(httpd_req_t *req) {
  httpd_log_request(req, "HTTP_API_SETTINGS");
  esp_err_t res = ESP_FAIL;

  char *settings_json_file = (char *) req->user_ctx;
  cJSON *settings_json = NULL;
  cJSON *req_json = NULL;
  char old_hostname[64];
  char new_hostname[64];
  bool hostname_changed = false;

  if(!(settings_json = cjson_read_from_file(settings_json_file))) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Cannot read settings file");
    goto cleanup;
  }

  if (!(req_json = httpd_read_json_body(req))) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid JSON");
    goto cleanup;
  }

  extract_hostname(settings_json, old_hostname, sizeof(old_hostname));

  if(config_change_settings(settings_json, req_json)) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to parse settings request");
    goto cleanup;
  }

  extract_hostname(settings_json, new_hostname, sizeof(new_hostname));
  hostname_changed = strcmp(old_hostname, new_hostname) != 0;

  /* Persist */
  if (cjson_save_to_file(settings_json, settings_json_file)) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to save settings on server");
    goto cleanup;
  }

  httpd_resp_sendstr(req, "OK");
  res = ESP_OK;

  if (hostname_changed) {
    app_hostname_changed(new_hostname);
  }

cleanup:
  if(req_json) free(req_json);
  if(settings_json) free(settings_json);
  return res;
}

#endif