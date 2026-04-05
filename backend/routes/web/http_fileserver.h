#ifndef HTTP_FILESERVER_H
#define HTTP_FILESERVER_H

#include <esp_http_server.h>
#include <esp_log.h>
#include <stdint.h>
#include <sys/stat.h>

#include "../../utils.h"

#define SCRATCH_BUFSIZE 8192

esp_err_t path_handler(httpd_req_t *req);

void http_fileserver_register(httpd_handle_t server, const char *base_path) {
  ESP_ERROR_CHECK(httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "*",
                                                                     .method = HTTP_GET,
                                                                     .handler = path_handler,
                                                                     .user_ctx = (void *) base_path}));
}

static esp_err_t set_content_type_from_file(httpd_req_t *req, const char *filename) {
  if (strstr(filename, ".html")) {
    return httpd_resp_set_type(req, "text/html");
  } else if (strstr(filename, ".css")) {
    return httpd_resp_set_type(req, "text/css");
  } else if (strstr(filename, ".js")) {
    return httpd_resp_set_type(req, "application/javascript");
  } else if (strstr(filename, ".json")) {
    return httpd_resp_set_type(req, "application/json");
  } else if (strstr(filename, ".png")) {
    return httpd_resp_set_type(req, "image/png");
  } else if (strstr(filename, ".ico")) {
    return httpd_resp_set_type(req, "image/x-icon");
  } else if (strstr(filename, ".svg")) {
    return httpd_resp_set_type(req, "image/svg+xml");
  } else if (strstr(filename, ".mp3")) {
    return httpd_resp_set_type(req, "audio/mpeg");
  } else if (strstr(filename, ".webmanifest")) {
    return httpd_resp_set_type(req, "application/manifest+json");
  }
  return httpd_resp_set_type(req, "application/octet-stream");
}

static bool is_html_file(const char *filename) {
  return filename && (strstr(filename, ".html") != NULL);
}

static void set_cache_headers(httpd_req_t *req, const char *filepath) {
  if (is_html_file(filepath)) {
    httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
  } else {
    httpd_resp_set_hdr(req, "Cache-Control", "public, max-age=31536000, immutable");
  }
}

static bool request_etag_matches(httpd_req_t *req, const char *etag) {
  if (!etag || !etag[0]) return false;

  size_t len = httpd_req_get_hdr_value_len(req, "If-None-Match");
  if (len == 0) return false;

  char *if_none_match = malloc(len + 1);
  if (!if_none_match) return false;

  bool matched = false;
  if (httpd_req_get_hdr_value_str(req, "If-None-Match", if_none_match, len + 1) == ESP_OK) {
    if (strstr(if_none_match, etag) != NULL) {
      matched = true;
    }
  }

  free(if_none_match);
  return matched;
}

esp_err_t path_handler(httpd_req_t *req) {
  esp_err_t ret = ESP_FAIL;
  httpd_log_request(req, "HTTP_FILESERVER");
  const char *base_path = (const char *) req->user_ctx;
  char filepath[600];

  if (strcmp(req->uri, "/") == 0) {
    snprintf(filepath, sizeof(filepath), "%s/index.html", base_path);
  } else {
    snprintf(filepath, sizeof(filepath), "%s%s", base_path, req->uri);
  }

  ESP_LOGI("HTTP_FILESERVER", "Serving file: %s", filepath);

  struct stat st;
  bool has_stat = (stat(filepath, &st) == 0);

  set_cache_headers(req, filepath);

  char etag[64] = {0};
  if (has_stat) {
    snprintf(etag, sizeof(etag), "W/\"%lx-%lx\"", (unsigned long) st.st_mtime,
             (unsigned long) st.st_size);
    httpd_resp_set_hdr(req, "ETag", etag);
  }

  if (has_stat && request_etag_matches(req, etag)) {
    httpd_resp_set_status(req, "304 Not Modified");
    return httpd_resp_send(req, NULL, 0);
  }

  FILE *fd = fopen(filepath, "r");
  if (!fd) {
    ESP_LOGE("HTTP_FILESERVER", "Failed to read existing file : %s", filepath);
    httpd_resp_send_err(req, HTTPD_404_NOT_FOUND, "File not found");
    goto cleanup;
  }

  set_content_type_from_file(req, filepath);

  char *chunk = malloc(SCRATCH_BUFSIZE);
  if (!chunk) {
    ESP_LOGE("HTTP_FILESERVER", "Failed to allocate memory for chunk");
    fclose(fd);
    ret = ESP_ERR_NO_MEM;
    goto cleanup;
  }

  size_t chunksize;
  do {
    chunksize = fread(chunk, 1, SCRATCH_BUFSIZE, fd);
    if (chunksize > 0) {
      if ((ret = httpd_resp_send_chunk(req, chunk, chunksize))) {
        fclose(fd);
        free(chunk);
        ESP_LOGE("HTTP_FILESERVER", "File sending failed!");
        goto cleanup;
      }
    }
  } while (chunksize != 0);

  free(chunk);
  fclose(fd);

  ret = httpd_resp_send_chunk(req, NULL, 0);

cleanup:
  return ret;
}

#endif
