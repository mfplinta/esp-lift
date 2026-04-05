#ifndef WS_REP_COUNTER_H
#define WS_REP_COUNTER_H

#include <cJSON.h>
#include <stdbool.h>
#include <stddef.h>
#include <string.h>

#include "../../rep_counter.h"

static inline bool ws_rep_counter_parse_side(const char *name, rep_side_t *side_out) {
  if (!name || !side_out) return false;
  if (strcmp(name, "left") == 0) {
    *side_out = REP_SIDE_LEFT;
    return true;
  }
  if (strcmp(name, "right") == 0) {
    *side_out = REP_SIDE_RIGHT;
    return true;
  }
  return false;
}

static inline void ws_rep_counter_handle_message(const char *payload, size_t len, void *ctx) {
  rep_counter_t *counter = (rep_counter_t *) ctx;
  if (!counter || !payload || len == 0) return;

  cJSON *root = cJSON_ParseWithLength(payload, len);
  if (!root) return;

  const cJSON *event = cJSON_GetObjectItem(root, "event");
  if (!cJSON_IsString(event) || strcmp(event->valuestring, "threshold") != 0) {
    cJSON_Delete(root);
    return;
  }

  const cJSON *name = cJSON_GetObjectItem(root, "name");
  const cJSON *threshold = cJSON_GetObjectItem(root, "threshold");
  if (!cJSON_IsString(name) || !cJSON_IsNumber(threshold)) {
    cJSON_Delete(root);
    return;
  }

  rep_side_t side;
  if (!ws_rep_counter_parse_side(name->valuestring, &side)) {
    cJSON_Delete(root);
    return;
  }

  double rep_band = REP_DEADBAND_DEFAULT;
  const cJSON *rep_band_json = cJSON_GetObjectItem(root, "repBand");
  if (cJSON_IsNumber(rep_band_json)) {
    rep_band = rep_band_json->valuedouble;
  }

  rep_counter_set_threshold(counter, side, threshold->valuedouble, rep_band);
  cJSON_Delete(root);
}

#endif
