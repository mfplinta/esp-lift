#ifndef UTILS_H
#define UTILS_H

#include <cJSON.h>
#include <ctype.h>
#include <esp_err.h>
#include <esp_http_server.h>
#include <esp_log.h>
#include <lwip/inet.h>
#include <lwip/sockets.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void url_decode(char *dst, const char *src) {
  char a, b;
  while (*src) {
    if ((*src == '%') && ((a = src[1]) && (b = src[2])) && isxdigit(a) && isxdigit(b)) {
      if (a >= 'a') a -= 'a' - 'A';
      if (a >= 'A')
        a -= ('A' - 10);
      else
        a -= '0';
      if (b >= 'a') b -= 'a' - 'A';
      if (b >= 'A')
        b -= ('A' - 10);
      else
        b -= '0';
      *dst++ = 16 * a + b;
      src += 3;
    } else if (*src == '+') {
      *dst++ = ' '; // convert + to space
      src++;
    } else {
      *dst++ = *src++;
    }
  }
  *dst = '\0';
}

static double clamp_double(double value, double min, double max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

static inline bool httpd_get_client_ip(httpd_req_t *req, char *out, size_t out_len) {
  if (!req || !out || out_len == 0) return false;

  int sock = httpd_req_to_sockfd(req);
  struct sockaddr_storage addr;
  socklen_t addr_len = sizeof(addr);

  if (getpeername(sock, (struct sockaddr *) &addr, &addr_len) != 0) {
    return false;
  }

  if (addr.ss_family == AF_INET) {
    struct sockaddr_in *addr_in = (struct sockaddr_in *) &addr;
    return inet_ntop(AF_INET, &addr_in->sin_addr, out, out_len) != NULL;
  }

  if (addr.ss_family == AF_INET6) {
    struct sockaddr_in6 *addr_in6 = (struct sockaddr_in6 *) &addr;
    return inet_ntop(AF_INET6, &addr_in6->sin6_addr, out, out_len) != NULL;
  }

  return false;
}

static inline void httpd_log_request(httpd_req_t *req, const char *tag) {
  const char *method = "";
  switch (req->method) {
  case HTTP_GET:
    method = "GET";
    break;
  case HTTP_POST:
    method = "POST";
    break;
  case HTTP_PUT:
    method = "PUT";
    break;
  case HTTP_DELETE:
    method = "DELETE";
    break;
  case HTTP_HEAD:
    method = "HEAD";
    break;
  case HTTP_OPTIONS:
    method = "OPTIONS";
    break;
  case HTTP_PATCH:
    method = "PATCH";
    break;
  default:
    method = "UNKNOWN";
    break;
  }

  char ip[INET6_ADDRSTRLEN];
  if (httpd_get_client_ip(req, ip, sizeof(ip))) {
    ESP_LOGI(tag, "%s %s from %s", method, req->uri, ip);
  } else {
    ESP_LOGI(tag, "%s %s from <unknown>", method, req->uri);
  }
}

/**
 * Must be freed by the caller
 */
static char *httpd_read_body(httpd_req_t *req) {
  int total_len = req->content_len;
  int received = 0;
  char *buf = malloc(total_len + 1);

  if (buf == NULL) {
    return NULL;
  }

  while (received < total_len) {
    int ret = httpd_req_recv(req, buf + received, total_len - received);
    if (ret <= 0) {
      free(buf);
      return NULL;
    }
    received += ret;
  }

  buf[total_len] = '\0';
  return buf;
}

/**
 * Must be freed by the caller
 */
static cJSON *httpd_read_json_body(httpd_req_t *req) {
  char *body = httpd_read_body(req);
  if (body == NULL) {
    return NULL;
  }

  cJSON *json = cJSON_Parse(body);
  free(body);

  return json;
}

static esp_err_t read_file_to_buf(const char *path, char **out, size_t *len) {
  if (!out) return ESP_ERR_INVALID_ARG;
  FILE *file = fopen(path, "rb");
  if (!file) return ESP_FAIL;

  fseek(file, 0, SEEK_END);
  long size = ftell(file);
  rewind(file);

  if (size <= 0) {
    fclose(file);
    return ESP_FAIL;
  }

  char *buffer = malloc((size_t) size + 1);
  if (!buffer) {
    fclose(file);
    return ESP_ERR_NO_MEM;
  }

  size_t read = fread(buffer, 1, (size_t) size, file);
  fclose(file);

  if (read != (size_t) size) {
    free(buffer);
    return ESP_FAIL;
  }

  buffer[size] = '\0';
  *out = buffer;
  if (len) *len = (size_t) size + 1;
  return ESP_OK;
}

static esp_err_t write_buf_to_file(const char *path, const char *data, size_t len) {
  FILE *file = fopen(path, "wb");
  if (!file) return ESP_FAIL;

  size_t written = fwrite(data, 1, len, file);
  fclose(file);
  return written == len ? ESP_OK : ESP_FAIL;
}

/**
 * Must be freed by the caller
 */
cJSON *cjson_read_from_file(const char *path) {
  char *json_string = NULL;
  if (read_file_to_buf(path, &json_string, NULL) != ESP_OK) {
    return NULL;
  }
  cJSON *root = cJSON_Parse(json_string);
  free(json_string);

  if (root == NULL) {
    const char *error = cJSON_GetErrorPtr();
    if (error != NULL) {
      fprintf(stderr, "JSON parse error before: %s\n", error);
    }
    return NULL;
  }

  return root;
}

int cjson_save_to_file(const cJSON *root, const char *path) {
  char *json_string = cJSON_PrintUnformatted(root);
  if (json_string == NULL) {
    return EXIT_FAILURE;
  }

  size_t length = strlen(json_string);
  esp_err_t err = write_buf_to_file(path, json_string, length);
  free(json_string);

  return err == ESP_OK ? 0 : 1;
}

#endif