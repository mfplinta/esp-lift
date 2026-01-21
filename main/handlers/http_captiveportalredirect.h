#ifndef HTTP_CAPTIVEPORTALREDIRECT_H
#define HTTP_CAPTIVEPORTALREDIRECT_H

#include <esp_http_server.h>

const char *captive_paths[] = {"/generate_204", "/fwlink", "/hotspot-detect.html", "/ncsi.txt",
                                "/connecttest.txt"};

static esp_err_t captive_portal_handler(httpd_req_t *req) {
  const char *location = "http://192.168.4.1/";
  httpd_resp_set_status(req, "302 Found");
  httpd_resp_set_hdr(req, "Location", location);
  httpd_resp_send(req, NULL, 0);

  ESP_LOGI("HTTP_CAPTIVEPORTALREDIRECT", "Redirecting captive portal request to %s", location);
  return ESP_OK;
}

size_t get_captive_paths_count() {
  return sizeof(captive_paths) / sizeof(captive_paths[0]);
}

void http_captiveportalredirect_register(httpd_handle_t server) {
  for (size_t i = 0; i < get_captive_paths_count(); i++) {
    httpd_uri_t *uri = malloc(sizeof(httpd_uri_t));
    if (!uri) {
      ESP_LOGE("HTTP_CAPTIVEPORTALREDIRECT", "Failed to allocate memory for URI handler");
      continue;
    }

    *uri = (httpd_uri_t) {.uri = captive_paths[i],
                          .method = HTTP_GET,
                          .handler = captive_portal_handler,
                          .user_ctx = NULL};

    ESP_ERROR_CHECK(httpd_register_uri_handler(server, uri));
  }
}

#endif