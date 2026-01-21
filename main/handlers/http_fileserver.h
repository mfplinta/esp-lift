#ifndef HTTP_FILESERVER_H
#define HTTP_FILESERVER_H

#include "esp_log.h"
#include <esp_http_server.h>
#include <stdint.h>

#define SCRATCH_BUFSIZE 8192

esp_err_t path_handler(httpd_req_t *req);

void http_fileserver_register(httpd_handle_t server, const char *base_path) {
  ESP_ERROR_CHECK(httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "*",
                                                                     .method = HTTP_GET,
                                                                     .handler = path_handler,
                                                                     .user_ctx = (void *) "/www"}));
}

static esp_err_t set_content_type_from_file(httpd_req_t *req, const char *filename) {
  if (strstr(filename, ".html")) {
    return httpd_resp_set_type(req, "text/html");
  } else if (strstr(filename, ".css")) {
    return httpd_resp_set_type(req, "text/css");
  } else if (strstr(filename, ".js")) {
    return httpd_resp_set_type(req, "application/javascript");
  }
  return httpd_resp_set_type(req, "text/plain");
}

esp_err_t path_handler(httpd_req_t *req) {
  const char *base_path = (const char *) req->user_ctx;
  char filepath[600];

  // If requests "/", serve "/index.html"
  if (strcmp(req->uri, "/") == 0) {
    snprintf(filepath, sizeof(filepath), "%s/index.html", base_path);
  } else {
    snprintf(filepath, sizeof(filepath), "%s%s", base_path, req->uri);
  }

  ESP_LOGI("HTTP_FILESERVER", "Serving file: %s", filepath);
  FILE *fd = fopen(filepath, "r");
  if (!fd) {
    ESP_LOGE("HTTP_FILESERVER", "Failed to read existing file : %s", filepath);
    httpd_resp_send_err(req, HTTPD_404_NOT_FOUND, "File not found");
    return ESP_FAIL;
  }

  set_content_type_from_file(req, filepath);

  char *chunk = malloc(SCRATCH_BUFSIZE);
  if (!chunk) {
    ESP_LOGE("HTTP_FILESERVER", "Failed to allocate memory for chunk");
    fclose(fd);
    return ESP_ERR_NO_MEM;
  }

  size_t chunksize;
  do {
    chunksize = fread(chunk, 1, SCRATCH_BUFSIZE, fd);
    if (chunksize > 0) {
      if (httpd_resp_send_chunk(req, chunk, chunksize) != ESP_OK) {
        fclose(fd);
        free(chunk);
        ESP_LOGE("HTTP_FILESERVER", "File sending failed!");
        return ESP_FAIL;
      }
    }
  } while (chunksize != 0);

  free(chunk);
  fclose(fd);

  httpd_resp_send_chunk(req, NULL, 0);
  return ESP_OK;
}

#endif