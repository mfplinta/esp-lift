#ifndef UTILS_H
#define UTILS_H

#include <cJSON.h>
#include <ctype.h>
#include <esp_http_server.h>

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

/**
 * Must be freed by the caller
 */
cJSON *cjson_read_from_file(const char *path) {
  FILE *file = fopen(path, "rb");
  char *json_string = NULL;
  long length = 0;

  if (file == NULL) {
    return NULL;
  }

  fseek(file, 0, SEEK_END);
  length = ftell(file);
  rewind(file);

  json_string = malloc(length + 1);
  if (json_string == NULL) {
    fclose(file);
    return NULL;
  }

  if (fread(json_string, 1, length, file) != (size_t) length) {
    fclose(file);
    free(json_string);
    return NULL;
  }

  json_string[length] = '\0';
  fclose(file);

  if (json_string == NULL) {
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

  FILE *file = fopen(path, "wb");
  if (file == NULL) {
    free(json_string);
    return EXIT_FAILURE;
  }

  size_t length = strlen(json_string);
  size_t written = fwrite(json_string, 1, length, file);

  fclose(file);
  free(json_string);

  return written != length;
}

#endif