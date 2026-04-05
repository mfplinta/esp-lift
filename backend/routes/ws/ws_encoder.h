#ifndef WS_ENCODER_H
#define WS_ENCODER_H

#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "../../encoder.h"
#include "../../transport/http/https_server.h"
#include "../../transport/ws/ws_server.h"

typedef struct {
  encoder_t *left_encoder;
  encoder_t *right_encoder;
  int32_t last_left_calibrated_sent;
  int32_t last_right_calibrated_sent;
} ws_encoder_context_t;

static inline void ws_encoder_init(ws_encoder_context_t *ctx, encoder_t *left_encoder,
                                   encoder_t *right_encoder) {
  if (!ctx) return;

  ctx->left_encoder = left_encoder;
  ctx->right_encoder = right_encoder;
  ctx->last_left_calibrated_sent = -1;
  ctx->last_right_calibrated_sent = -1;
}

static inline void ws_encoder_publish(ws_encoder_context_t *ctx, const char *event_type,
                                      const char *encoder_name, encoder_t *encoder,
                                      const char *cal_state_name) {
  if (!ctx || !event_type || !encoder_name || !encoder || !cal_state_name) return;

  char payload[160];
  int32_t calibrated_int = (int32_t) ceil(encoder->state.calibrated);
  if (calibrated_int < 0) calibrated_int = 0;
  if (calibrated_int > 100) calibrated_int = 100;

  if (strcmp(event_type, "position") == 0) {
    int32_t *last_sent = NULL;

    if (encoder == ctx->left_encoder) {
      last_sent = &ctx->last_left_calibrated_sent;
    } else if (encoder == ctx->right_encoder) {
      last_sent = &ctx->last_right_calibrated_sent;
    }

    if (last_sent && *last_sent == calibrated_int) {
      return;
    }

    if (last_sent) {
      *last_sent = calibrated_int;
    }
  }

  snprintf(payload, sizeof(payload),
           "{\"event\": \"%s\", \"name\": \"%s\", \"calibrated\": %ld, "
           "\"cal_state\": \"%s\"}",
           event_type, encoder_name, (long) calibrated_int, cal_state_name);

  resp_arg_t *resp_arg = malloc(sizeof(resp_arg_t));
  if (!resp_arg) {
    ESP_LOGE("WS_ENCODER", "Could not allocate websocket response args");
    return;
  }

  resp_arg->hd = https_server_get_handle();
  resp_arg->data = strdup(payload);
  if (!resp_arg->data) {
    ESP_LOGE("WS_ENCODER", "Could not allocate websocket response payload");
    free(resp_arg);
    return;
  }

  ws_send_message(resp_arg);
}

#endif
