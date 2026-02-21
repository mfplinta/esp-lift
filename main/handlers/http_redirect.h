#ifndef HTTP_REDIRECT_H
#define HTTP_REDIRECT_H

#include <esp_http_server.h>
#include <esp_log.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#include "../utils.h"

typedef const char *(*http_redirect_target_fn)(void *ctx);

typedef struct {
  http_redirect_target_fn target_fn;
  void *target_ctx;
  const char *fallback_target;
  const char *log_tag;
  const char *path;
  int status_code;
} http_redirect_config_t;

static char *http_redirect_get_request_host(httpd_req_t *req) {
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

static const char *http_redirect_status_text(int status_code) {
  switch (status_code) {
    case 301:
      return "301 Moved Permanently";
    case 302:
      return "302 Found";
    case 307:
      return "307 Temporary Redirect";
    case 308:
      return "308 Permanent Redirect";
    default:
      return "302 Found";
  }
}

static esp_err_t http_redirect_handler(httpd_req_t *req) {
  http_redirect_config_t *config = (http_redirect_config_t *) req->user_ctx;
  const char *log_tag = (config && config->log_tag) ? config->log_tag : "HTTP_REDIRECT";
  httpd_log_request(req, log_tag);

  char *request_host = http_redirect_get_request_host(req);
  const char *fallback = NULL;
  if (config && config->target_fn) {
    fallback = config->target_fn(config->target_ctx);
  } else if (config) {
    fallback = config->fallback_target;
  }

  const char *target = (request_host && request_host[0]) ? request_host : fallback;
  char *location = NULL;

  if (target) {
    size_t target_len = strlen(target);
    size_t uri_len = strlen(req->uri);
    size_t total_len = target_len + uri_len + strlen("https://") + 1;
    location = malloc(total_len);
    if (location) {
      snprintf(location, total_len, "https://%s%s", target, req->uri);
    }
  }

  int status_code = (config && config->status_code) ? config->status_code : 301;
  httpd_resp_set_status(req, http_redirect_status_text(status_code));
  if (!location) {
    const char *safe_target = target ? target : "";
    size_t fallback_len = strlen("https://") + strlen(safe_target) + 2;
    location = malloc(fallback_len);
    if (location) {
      snprintf(location, fallback_len, "https://%s/", safe_target);
    }
  }

  if (location) {
    httpd_resp_set_hdr(req, "Location", location);
  }
  httpd_resp_send(req, NULL, 0);

  if (location) free(location);
  if (request_host) free(request_host);
  return ESP_OK;
}

static esp_err_t http_redirect_register(httpd_handle_t server, const http_redirect_config_t *config) {
  if (!server) return ESP_ERR_INVALID_ARG;

  http_redirect_config_t *cfg = malloc(sizeof(http_redirect_config_t));
  if (!cfg) return ESP_ERR_NO_MEM;

  if (config) {
    *cfg = *config;
  } else {
    memset(cfg, 0, sizeof(*cfg));
  }

  const char *path = cfg->path ? cfg->path : "/*";

  httpd_uri_t *redirect_get = malloc(sizeof(httpd_uri_t));
  httpd_uri_t *redirect_post = malloc(sizeof(httpd_uri_t));
  if (!redirect_get || !redirect_post) {
    free(redirect_get);
    free(redirect_post);
    free(cfg);
    return ESP_ERR_NO_MEM;
  }

  *redirect_get = (httpd_uri_t) {.uri = path,
                                .method = HTTP_GET,
                                .handler = http_redirect_handler,
                                .user_ctx = cfg};
  *redirect_post = (httpd_uri_t) {.uri = path,
                                 .method = HTTP_POST,
                                 .handler = http_redirect_handler,
                                 .user_ctx = cfg};

  esp_err_t err = httpd_register_uri_handler(server, redirect_get);
  if (err != ESP_OK) {
    free(redirect_get);
    free(redirect_post);
    free(cfg);
    return err;
  }

  err = httpd_register_uri_handler(server, redirect_post);
  if (err != ESP_OK) {
    free(redirect_post);
    return err;
  }

  return ESP_OK;
}

#endif
