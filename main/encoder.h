#ifndef ENCODER_H
#define ENCODER_H

#include "driver/gpio.h"
#include "esp_attr.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

#define DEBOUNCE_MS 100
#define CAL_MIN 0.0
#define CAL_MAX 100.0
#define CAL_DEBOUNCE_STEPS 5

typedef enum { ENC_EVENT_ROTATION, ENC_EVENT_CALIBRATION_DONE } encoder_event_type;

typedef enum { CAL_IDLE, CAL_SEEK_MAX, CAL_DONE } calibration_state;

typedef enum { DIR_NONE = 0, DIR_POSITIVE, DIR_NEGATIVE } rotation_dir;

typedef struct encoder encoder;

typedef struct encoder_event {
  encoder *source;
  encoder_event_type type;
} encoder_event;

typedef struct encoder_config {
  const char *name;
  gpio_num_t pin_a, pin_b, pin_z;
  void (*callback)(encoder_event *event);
} encoder_config;

typedef struct encoder {
  encoder_config *config;
  volatile int32_t raw_count;
  volatile int32_t offset;
  volatile uint32_t last_time;

  volatile calibration_state cal_state;
  volatile rotation_dir cal_dir;

  volatile int32_t start_count;
  volatile int32_t max_distance;
  volatile int32_t reverse_accum;

  volatile bool is_calibrated;
  volatile bool z_seen;

  volatile double calibrated;
} encoder;

static inline rotation_dir detect_dir(int32_t delta) {
  if (delta > 0)
    return DIR_POSITIVE;
  if (delta < 0)
    return DIR_NEGATIVE;
  return DIR_NONE;
}

static inline void send_callback(encoder *enc, encoder_event_type event) {
  if (!enc->config || !enc->config->callback)
    return;

  uint32_t now = xTaskGetTickCountFromISR();
  uint32_t debounce_ticks = pdMS_TO_TICKS(DEBOUNCE_MS);

  if ((now - enc->last_time) >= debounce_ticks) {
    enc->last_time = now;
    enc->config->callback(&(encoder_event) {.source = enc, .type = event});
  }
}

static inline void encoder_calibration_step(encoder *enc, int32_t delta_raw) {
  if (delta_raw == 0)
    return;

  rotation_dir dir = detect_dir(delta_raw);
  int32_t logical = enc->raw_count + enc->offset;
  int32_t dist = logical - enc->start_count;
  int32_t abs_dist = dist < 0 ? -dist : dist;
  int32_t step = delta_raw < 0 ? -delta_raw : delta_raw;

  switch (enc->cal_state) {

  case CAL_IDLE:
    enc->start_count = logical;
    enc->max_distance = 0;
    enc->reverse_accum = 0;
    enc->cal_dir = dir;
    enc->cal_state = CAL_SEEK_MAX;
    enc->is_calibrated = false;
    break;

  case CAL_SEEK_MAX:
    if (abs_dist > enc->max_distance)
      enc->max_distance = abs_dist;

    if (dir == enc->cal_dir) {
      enc->reverse_accum = 0;
    } else {
      enc->reverse_accum += step;
      if (enc->reverse_accum >= CAL_DEBOUNCE_STEPS && enc->max_distance > 0) {
        enc->cal_state = CAL_DONE;
        enc->is_calibrated = true;
        send_callback(enc, ENC_EVENT_CALIBRATION_DONE);
      }
    }
    break;

  case CAL_DONE:
    break;
  }
}

static inline void encoder_update_calibrated(encoder *enc) {
  if (!enc->is_calibrated || enc->max_distance <= 0) {
    enc->calibrated = CAL_MIN;
    return;
  }

  int32_t logical = enc->raw_count + enc->offset;
  int32_t dist = logical - enc->start_count;

  // If initial motion was negative, invert distance so start_count = CAL_MIN
  if (enc->cal_dir == DIR_NEGATIVE) {
    dist = -dist;
  }

  double norm = (double) dist / (double) enc->max_distance;
  enc->calibrated = CAL_MIN + norm * (CAL_MAX - CAL_MIN);
}

static void IRAM_ATTR rotation_handler(void *arg) {
  encoder *enc = (encoder *) arg;
  if (!enc)
    return;

  int32_t prev_raw = enc->raw_count;

  if (gpio_get_level(enc->config->pin_b))
    enc->raw_count++;
  else
    enc->raw_count--;

  int32_t delta_raw = enc->raw_count - prev_raw;

  encoder_calibration_step(enc, delta_raw);
  encoder_update_calibrated(enc);

  send_callback(enc, ENC_EVENT_ROTATION);
}

static void IRAM_ATTR reset_handler(void *arg) {
  encoder *enc = (encoder *) arg;
  if (!enc)
    return;
  if (enc->cal_state < CAL_DONE)
    return;

  int32_t logical_before = enc->raw_count + enc->offset;

  enc->raw_count = 0;
  enc->offset = logical_before;
  enc->z_seen = true;
}

void encoder_reset_calibration(encoder *enc) {
  if (!enc)
    return;

  ESP_LOGI("ENCODER", "Cleared calibration for %s", enc->config->name);
  enc->cal_state = CAL_IDLE;
  enc->cal_dir = DIR_NONE;
  enc->start_count = enc->raw_count + enc->offset;
  enc->max_distance = 0;
  enc->reverse_accum = 0;
  enc->is_calibrated = false;
  enc->z_seen = false;
  enc->calibrated = CAL_MIN;
}

encoder *init_encoder(encoder_config *enc_config) {
  if (!enc_config)
    return NULL;

  gpio_config_t io_conf = {};
  io_conf.intr_type = GPIO_INTR_NEGEDGE;
  io_conf.pin_bit_mask =
    ((1ULL << (uint64_t) enc_config->pin_a) | (1ULL << (uint64_t) enc_config->pin_b) |
     (1ULL << (uint64_t) enc_config->pin_z));
  io_conf.mode = GPIO_MODE_INPUT;
  gpio_config(&io_conf);

  encoder *enc = calloc(1, sizeof(encoder));
  if (!enc)
    return NULL;

  enc->config = enc_config;
  enc->raw_count = 0;
  enc->offset = 0;
  enc->last_time = 0;
  enc->cal_state = CAL_IDLE;
  enc->cal_dir = DIR_NONE;
  enc->start_count = 0;
  enc->max_distance = 0;
  enc->reverse_accum = 0;
  enc->is_calibrated = false;
  enc->z_seen = false;
  enc->calibrated = CAL_MIN;

  gpio_install_isr_service(0);
  gpio_isr_handler_add(enc_config->pin_a, rotation_handler, enc);
  gpio_isr_handler_add(enc_config->pin_z, reset_handler, enc);

  return enc;
}

#endif
