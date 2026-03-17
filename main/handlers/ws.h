#ifndef WS_H
#define WS_H

#include <esp_http_server.h>
#include <esp_log.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <sdkconfig.h>
#include <stdbool.h>
#include <string.h>
#include <strings.h>

#include "../utils.h"

#define WS_TAG "WS"

#define WS_MAX_RX_LEN 2048

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

typedef struct {
  httpd_ws_type_t type;
  uint8_t *buf;
  size_t len;
} ws_frag_ctx_t;

#define WS_HANDSHAKE_INTERVAL_MS 10000
#define WS_HANDSHAKE_TASK_STACK 4096

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
      xTaskCreate(ws_handshake_broadcast_task, "ws_handshake_broadcast", WS_HANDSHAKE_TASK_STACK,
          NULL, 5, NULL);
    }
    ESP_ERROR_CHECK(httpd_register_uri_handler(server, &(httpd_uri_t) {.uri = "/ws",
                                                                     .method = HTTP_GET,
                                                                     .handler = ws_handler,
                                                                     .user_ctx = NULL,
                                                                     .is_websocket = true,
                                                                     .handle_ws_control_frames = true}));
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

  httpd_ws_frame_t ws_pkt = {0};
  ws_pkt.payload = (uint8_t *) resp_arg->data;
  ws_pkt.len = strlen(resp_arg->data);
  ws_pkt.type = HTTPD_WS_TYPE_TEXT;
  ws_pkt.fragmented = false;
  ws_pkt.final = true;

  size_t fds = CONFIG_LWIP_MAX_SOCKETS;
  int client_fds[CONFIG_LWIP_MAX_SOCKETS];

  esp_err_t ret;

  if ((ret = httpd_get_client_list(resp_arg->hd, &fds, client_fds))) {
    ESP_LOGW(WS_TAG, "httpd_get_client_list failed: %d", (int) ret);
    goto cleanup;
  }

  for (int i = 0; i < fds; i++) {
    int client_info = httpd_ws_get_fd_info(resp_arg->hd, client_fds[i]);
    if (client_info == HTTPD_WS_CLIENT_WEBSOCKET) {
      ret = httpd_ws_send_frame_async(resp_arg->hd, client_fds[i], &ws_pkt);
      if (ret != ESP_OK) {
        ESP_LOGW(WS_TAG, "ws send failed fd=%d err=%d; closing session", client_fds[i], (int) ret);
        httpd_sess_trigger_close(resp_arg->hd, client_fds[i]);
      }
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
    ESP_LOGE(WS_TAG, "Could not queue message");
    free(resp_arg->data);
    free(resp_arg);
  }
}

static void ws_force_close(httpd_req_t *req, const char *why, esp_err_t err) {
  if (!req) return;
  int sockfd = httpd_req_to_sockfd(req);
  if (err == ESP_OK) {
    ESP_LOGD(WS_TAG, "Closing ws session fd=%d (%s)", sockfd, why ? why : "?");
  } else {
    ESP_LOGW(WS_TAG, "Closing ws session fd=%d (%s) err=%d", sockfd, why ? why : "?", (int) err);
  }
  if (ws_server_handle) {
    esp_err_t close_ret = httpd_sess_trigger_close(ws_server_handle, sockfd);
    if (close_ret != ESP_OK) {
      ESP_LOGW(WS_TAG, "httpd_sess_trigger_close failed fd=%d err=%d", sockfd, (int) close_ret);
    }
  }
}

static void ws_frag_ctx_free(void *ctx) {
  ws_frag_ctx_t *f = (ws_frag_ctx_t *) ctx;
  if (!f) return;
  if (f->buf) free(f->buf);
  free(f);
}

static ws_frag_ctx_t *ws_get_frag_ctx(int sockfd) {
  if (!ws_server_handle) return NULL;
  ws_frag_ctx_t *ctx = (ws_frag_ctx_t *) httpd_sess_get_ctx(ws_server_handle, sockfd);
  if (ctx) return ctx;
  ctx = (ws_frag_ctx_t *) calloc(1, sizeof(ws_frag_ctx_t));
  if (!ctx) return NULL;
  ctx->type = HTTPD_WS_TYPE_CONTINUE;
  httpd_sess_set_ctx(ws_server_handle, sockfd, ctx, ws_frag_ctx_free);
  return ctx;
}

static void ws_clear_frag_ctx(int sockfd) {
  if (!ws_server_handle) return;
  ws_frag_ctx_t *ctx = (ws_frag_ctx_t *) httpd_sess_get_ctx(ws_server_handle, sockfd);
  if (!ctx) return;
  if (ctx->buf) {
    free(ctx->buf);
    ctx->buf = NULL;
  }
  ctx->len = 0;
  ctx->type = HTTPD_WS_TYPE_CONTINUE;
}

esp_err_t ws_handler(httpd_req_t *req) {
  if (!ws_server_handle) {
    ESP_LOGW(WS_TAG, "ws_server_handle not set");
    return ESP_FAIL;
  }

  int sockfd = httpd_req_to_sockfd(req);

  if (req->method == HTTP_GET) {
    char upgrade[16] = {0};
    size_t up_len = httpd_req_get_hdr_value_len(req, "Upgrade");
    if (up_len > 0 && up_len < sizeof(upgrade) &&
        httpd_req_get_hdr_value_str(req, "Upgrade", upgrade, sizeof(upgrade)) == ESP_OK &&
        strcasecmp(upgrade, "websocket") == 0) {
      return ESP_OK;
    }

    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "WebSocket upgrade required");
    return ESP_FAIL;
  }

  esp_err_t ret = ESP_OK;
  uint8_t *buf = NULL;

  httpd_ws_frame_t ws_pkt;
  memset(&ws_pkt, 0, sizeof(httpd_ws_frame_t));

  if ((ret = httpd_ws_recv_frame(req, &ws_pkt, 0))) {
    ws_force_close(req, "recv_header", ret);
    goto cleanup;
  }

  if (ws_pkt.len > WS_MAX_RX_LEN) {
    ESP_LOGW(WS_TAG, "Oversized ws frame len=%u type=%d; closing", (unsigned) ws_pkt.len,
             (int) ws_pkt.type);
    ws_force_close(req, "oversize", ESP_FAIL);
    ret = ESP_FAIL;
    goto cleanup;
  }

  if (ws_pkt.len > 0) {
    buf = (uint8_t *) calloc(1, ws_pkt.len + 1);
    if (!buf) {
      ret = ESP_ERR_NO_MEM;
      ws_force_close(req, "no_mem", ret);
      goto cleanup;
    }
    ws_pkt.payload = buf;
    if ((ret = httpd_ws_recv_frame(req, &ws_pkt, ws_pkt.len))) {
      ESP_LOGW(WS_TAG, "httpd_ws_recv_frame payload failed fd=%d err=%d", sockfd, (int) ret);
      ws_force_close(req, "recv_payload", ret);
      goto cleanup;
    }
  }

  switch (ws_pkt.type) {
    case HTTPD_WS_TYPE_CONTINUE: {
      ws_frag_ctx_t *ctx = ws_get_frag_ctx(sockfd);
      if (!ctx || ctx->type != HTTPD_WS_TYPE_TEXT || !ctx->buf) {
        break;
      }

      if ((ctx->len + ws_pkt.len) > WS_MAX_RX_LEN) {
        ESP_LOGW(WS_TAG, "Reassembled ws msg too big fd=%d total=%u; closing", sockfd,
                 (unsigned) (ctx->len + ws_pkt.len));
        ws_clear_frag_ctx(sockfd);
        ws_force_close(req, "frag_oversize", ESP_FAIL);
        ret = ESP_FAIL;
        break;
      }

      uint8_t *nbuf = (uint8_t *) realloc(ctx->buf, ctx->len + ws_pkt.len + 1);
      if (!nbuf) {
        ws_clear_frag_ctx(sockfd);
        ws_force_close(req, "frag_no_mem", ESP_ERR_NO_MEM);
        ret = ESP_ERR_NO_MEM;
        break;
      }

      ctx->buf = nbuf;
      memcpy(ctx->buf + ctx->len, ws_pkt.payload, ws_pkt.len);
      ctx->len += ws_pkt.len;
      ctx->buf[ctx->len] = '\0';

      if (ws_pkt.final) {
        for (size_t i = 0; i < ws_subscriber_count; i++) {
          if (ws_subscribers[i]) {
            ws_subscribers[i]((const char *) ctx->buf, ctx->len, ws_subscriber_ctx[i]);
          }
        }
        ws_clear_frag_ctx(sockfd);
      }

      break;
    }
    case HTTPD_WS_TYPE_TEXT: {
      if (!ws_pkt.final) {
        ws_frag_ctx_t *ctx = ws_get_frag_ctx(sockfd);
        if (!ctx) {
          ws_force_close(req, "frag_no_ctx", ESP_ERR_NO_MEM);
          ret = ESP_ERR_NO_MEM;
          break;
        }
        ws_clear_frag_ctx(sockfd);
        ctx->type = HTTPD_WS_TYPE_TEXT;
        if (ws_pkt.len > 0) {
          ctx->buf = (uint8_t *) malloc(ws_pkt.len + 1);
          if (!ctx->buf) {
            ws_force_close(req, "frag_no_mem", ESP_ERR_NO_MEM);
            ret = ESP_ERR_NO_MEM;
            break;
          }
          memcpy(ctx->buf, ws_pkt.payload, ws_pkt.len);
          ctx->len = ws_pkt.len;
          ctx->buf[ctx->len] = '\0';
        }
        break;
      }
      if (ws_pkt.len > 0) {
        for (size_t i = 0; i < ws_subscriber_count; i++) {
          if (ws_subscribers[i]) {
            ws_subscribers[i]((const char *) ws_pkt.payload, ws_pkt.len, ws_subscriber_ctx[i]);
          }
        }
      }
      break;
    }
    case HTTPD_WS_TYPE_PING: {
      httpd_ws_frame_t pong = {.type = HTTPD_WS_TYPE_PONG, .payload = ws_pkt.payload, .len = ws_pkt.len};
      ret = httpd_ws_send_frame(req, &pong);
      if (ret != ESP_OK) {
        ws_force_close(req, "pong_send", ret);
      }
      break;
    }
    case HTTPD_WS_TYPE_PONG:
      break;
    case HTTPD_WS_TYPE_CLOSE: {
      char reason[64] = {0};
      if (ws_pkt.len >= 2 && ws_pkt.payload) {
        size_t rlen = ws_pkt.len - 2;
        if (rlen > 0) {
          if (rlen > (sizeof(reason) - 1)) rlen = (sizeof(reason) - 1);
          memcpy(reason, (const char *) (ws_pkt.payload + 2), rlen);
          reason[rlen] = '\0';
        }
      }
      httpd_ws_frame_t close_fr = {.type = HTTPD_WS_TYPE_CLOSE, .payload = ws_pkt.payload, .len = ws_pkt.len};
      (void) httpd_ws_send_frame(req, &close_fr);
      ws_force_close(req, "peer_close", ESP_OK);
      ret = ESP_OK;
      break;
    }
    case HTTPD_WS_TYPE_BINARY:
      break;
    default:
      ESP_LOGW(WS_TAG, "Unhandled ws frame type=%d len=%u fd=%d", (int) ws_pkt.type,
               (unsigned) ws_pkt.len, sockfd);
      break;
  }

cleanup:
  if (buf) free(buf);
  return ret;
}

#endif