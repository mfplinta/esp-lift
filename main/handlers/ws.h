#ifndef WS_H
#define WS_H

#include <esp_http_server.h>
#include <esp_log.h>
#include <sdkconfig.h>

typedef struct {
  httpd_handle_t hd;
  char *data;
} resp_arg_t;

static esp_err_t ws_handler(httpd_req_t *req);

void ws_register(httpd_handle_t server) {
    ESP_ERROR_CHECK(httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/ws",
                                                                     .method = HTTP_GET,
                                                                     .handler = ws_handler,
                                                                     .user_ctx = NULL,
                                                                     .is_websocket = true}));
}

void ws_async_send(void *arg) {
  resp_arg_t *resp_arg = (resp_arg_t*) arg;

  httpd_ws_frame_t ws_pkt;
  ws_pkt.payload = (uint8_t *) resp_arg->data;
  ws_pkt.len = strlen(resp_arg->data);
  ws_pkt.type = HTTPD_WS_TYPE_TEXT;

  static size_t max_clients = CONFIG_LWIP_MAX_LISTENING_TCP;
  size_t fds = max_clients;
  int client_fds[max_clients];

  esp_err_t ret = httpd_get_client_list(resp_arg->hd, &fds, client_fds);

  if (ret != ESP_OK) {
    goto cleanup;
  }

  for (int i = 0; i < fds; i++) {
    int client_info = httpd_ws_get_fd_info(resp_arg->hd, client_fds[i]);
    if (client_info == HTTPD_WS_CLIENT_WEBSOCKET) {
      httpd_ws_send_frame_async(resp_arg->hd, client_fds[i], &ws_pkt);
    }
  }

cleanup:
  free(resp_arg->data);
  free(resp_arg);
}

/**
 * Frees resp_arg
 */
void ws_send_message(resp_arg_t* resp_arg) {
  if (httpd_queue_work(resp_arg->hd, ws_async_send, resp_arg) != ESP_OK) {
    ESP_LOGE("WS", "Could not queue message");
    free(resp_arg->data);
    free(resp_arg);
  }
}

esp_err_t ws_handler(httpd_req_t *req) {
  if (req->method == HTTP_GET) {
    ESP_LOGI("WS", "New client connected.");
    return ESP_OK;
  }

  httpd_ws_frame_t ws_pkt;
  memset(&ws_pkt, 0, sizeof(httpd_ws_frame_t));

  esp_err_t ret = httpd_ws_recv_frame(req, &ws_pkt, 0);
  if (ret != ESP_OK) {
    return ret;
  }

  if (ws_pkt.type == HTTPD_WS_TYPE_TEXT) {
    ESP_LOGI("WS", "Received ws text of length %d", ws_pkt.len);

    uint8_t *buf = NULL;

    if (ws_pkt.len > 0) {
      buf = (uint8_t*) calloc(1, ws_pkt.len + 1);
      if (buf == NULL) {
        return ESP_ERR_NO_MEM;
      }
      ws_pkt.payload = buf;
      ret = httpd_ws_recv_frame(req, &ws_pkt, ws_pkt.len);
      if (ret != ESP_OK) {
        ESP_LOGE("WS", "httpd_ws_recv_frame failed with %d", ret);
      }
      free(buf);
      return ret;
    }
  } else {
    ESP_LOGW("WS", "Unsupported ws frame type %d", ws_pkt.type);
  }

  return ESP_OK;
}

#endif