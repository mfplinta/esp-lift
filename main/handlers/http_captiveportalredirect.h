#ifndef HTTP_CAPTIVEPORTALREDIRECT_H
#define HTTP_CAPTIVEPORTALREDIRECT_H

#include <esp_http_server.h>
#include <esp_log.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#include "../tls_cert.h"
#include "../utils.h"
#include "../wifi.h"

const char *captive_paths[] = {"/generate_204", "/fwlink", "/hotspot-detect.html", "/ncsi.txt",
                                "/connecttest.txt"};

static char *captive_get_request_host(httpd_req_t *req) {
  size_t len = httpd_req_get_hdr_value_len(req, "Host");
  if (len == 0) {
    return NULL;
  }

  char *host = malloc(len + 1);
  if (!host) {
    return NULL;
  }

  if (httpd_req_get_hdr_value_str(req, "Host", host, len + 1) != ESP_OK) {
    free(host);
    return NULL;
  }

  if (host[0] == '[') {
    char *end = strchr(host, ']');
    if (end) {
      end[1] = '\0';
    }
    return host;
  }

  char *colon = strchr(host, ':');
  if (colon) {
    *colon = '\0';
  }

  return host;
}

static esp_err_t captive_portal_handler(httpd_req_t *req) {
  httpd_log_request(req, "HTTP_CAPTIVEPORTALREDIRECT");
  char *request_host = captive_get_request_host(req);
  const char *hostname = tls_cert_get_hostname();
  const char *target = request_host && request_host[0]
                         ? request_host
                         : (hostname && hostname[0] ? hostname : wifi_get_ap_ip());
  char location[128];
  snprintf(location, sizeof(location), "https://%s/", target);
  httpd_resp_set_status(req, "302 Found");
  httpd_resp_set_hdr(req, "Location", location);
  httpd_resp_send(req, NULL, 0);

  ESP_LOGI("HTTP_CAPTIVEPORTALREDIRECT", "Redirecting captive portal request to %s", location);
  if (request_host) free(request_host);
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