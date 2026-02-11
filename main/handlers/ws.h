#ifndef WS_H
#define WS_H

#include <esp_http_server.h>
#include <esp_log.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <sdkconfig.h>
#include <stdbool.h>
#include <string.h>

typedef struct {
  httpd_handle_t hd;
  char *data;
} resp_arg_t;

typedef void (*ws_message_callback_t)(const char *payload, size_t len, void *ctx);

#define WS_MAX_SUBSCRIBERS 4

static ws_message_callback_t ws_subscribers[WS_MAX_SUBSCRIBERS];
static void *ws_subscriber_ctx[WS_MAX_SUBSCRIBERS];
static size_t ws_subscriber_count = 0;

static httpd_handle_t ws_server_handle = NULL;

#define WS_HANDSHAKE_INTERVAL_MS 10000

static esp_err_t ws_handler(httpd_req_t *req);
void ws_send_message(resp_arg_t* resp_arg);

static void ws_handshake_broadcast_task(void *arg) {
  (void) arg;
  const TickType_t interval_ticks = pdMS_TO_TICKS(WS_HANDSHAKE_INTERVAL_MS);

  while (1) {
    if (ws_server_handle) {
      resp_arg_t *resp_arg = malloc(sizeof(resp_arg_t));
      if (resp_arg) {
        resp_arg->hd = ws_server_handle;
        resp_arg->data = strdup("{\"event\":\"handshake\"}");
        if (resp_arg->data) {
          ws_send_message(resp_arg);
        } else {
          free(resp_arg);
        }
      }
    }
    vTaskDelay(interval_ticks);
  }
}

void ws_register(httpd_handle_t server) {
    ws_server_handle = server;
    static bool handshake_started = false;
    if (!handshake_started) {
      handshake_started = true;
      xTaskCreate(ws_handshake_broadcast_task, "ws_handshake_broadcast", 2048, NULL, 5, NULL);
    }
    ESP_ERROR_CHECK(httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/ws",
                                                                     .method = HTTP_GET,
                                                                     .handler = ws_handler,
                                                                     .user_ctx = NULL,
                                                                     .is_websocket = true}));
}

bool ws_subscribe_message(ws_message_callback_t cb, void *ctx) {
  if (!cb || ws_subscriber_count >= WS_MAX_SUBSCRIBERS) return false;
  ws_subscribers[ws_subscriber_count] = cb;
  ws_subscriber_ctx[ws_subscriber_count] = ctx;
  ws_subscriber_count++;
  return true;
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

  esp_err_t ret;

  if ((ret = httpd_get_client_list(resp_arg->hd, &fds, client_fds))) {
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
  if (httpd_queue_work(resp_arg->hd, ws_async_send, resp_arg)) {
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

  esp_err_t ret = ESP_OK;
  uint8_t *buf = NULL;

  httpd_ws_frame_t ws_pkt;
  memset(&ws_pkt, 0, sizeof(httpd_ws_frame_t));

  if ((ret = httpd_ws_recv_frame(req, &ws_pkt, 0))) {
    goto cleanup;
  }

  if (ws_pkt.type == HTTPD_WS_TYPE_TEXT) {
    ESP_LOGI("WS", "Received ws text of length %d", ws_pkt.len);

    if (ws_pkt.len > 0) {
      if (!(buf = (uint8_t*) calloc(1, ws_pkt.len + 1))) {
        ret = ESP_ERR_NO_MEM;
        goto cleanup;
      }
      ws_pkt.payload = buf;
      if ((ret = httpd_ws_recv_frame(req, &ws_pkt, ws_pkt.len))) {
        ESP_LOGE("WS", "httpd_ws_recv_frame failed with %d", ret);
      } else {
        for (size_t i = 0; i < ws_subscriber_count; i++) {
          if (ws_subscribers[i]) {
            ws_subscribers[i]((const char *) buf, ws_pkt.len, ws_subscriber_ctx[i]);
          }
        }
      }
    }
  } else {
    ESP_LOGW("WS", "Unsupported ws frame type %d", ws_pkt.type);
  }

cleanup:
  if(buf) free(buf);
  return ret;
}

#endif