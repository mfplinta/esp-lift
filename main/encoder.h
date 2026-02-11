#ifndef ENCODER_H
#define ENCODER_H

#include <driver/gpio.h>
#include <esp_attr.h>
#include <esp_log.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

#define CAL_MIN 0.0
#define CAL_MAX 100.0

typedef enum { CAL_IDLE, CAL_SEEK_MAX, CAL_DONE } calibration_state_t;
typedef enum { DIR_NONE = 0, DIR_POSITIVE, DIR_NEGATIVE } rotation_dir_t;
typedef enum { EVENT_ROTATION, EVENT_CALIBRATION_CHANGE } encoder_event_type_t;

struct encoder_event_t;
typedef struct {
  gpio_num_t pin_a, pin_b, pin_z;
  int debounce_interval;
  int32_t calibration_debounce_steps;
  void (*on_event_cb)(struct encoder_event_t *event);
} encoder_config_t;

typedef struct {
  volatile int32_t raw_count;
  volatile int32_t offset;
  volatile uint32_t last_time;

  volatile calibration_state_t cal_state;
  volatile rotation_dir_t cal_dir;

  volatile int32_t start_count;
  volatile int32_t max_distance;
  volatile int32_t reverse_accum;

  volatile bool z_seen;

  volatile double calibrated;
} encoder_state_t;

typedef struct {
  encoder_state_t state;
  encoder_config_t config;
  QueueHandle_t queue;
} encoder_t;

typedef struct encoder_event_t {
  encoder_t *source;
  encoder_event_type_t type;
} encoder_event_t;

static inline rotation_dir_t detect_dir(int32_t delta) {
  if (delta > 0) return DIR_POSITIVE;
  if (delta < 0) return DIR_NEGATIVE;
  return DIR_NONE;
}

static void event_consumer_task(void *arg) {
  QueueHandle_t queue = (QueueHandle_t) arg;
  encoder_event_t event;

  while (1) {
    if (!xQueueReceive(queue, &event, portMAX_DELAY)) continue;

    event.source->config.on_event_cb(&event);
  }
}

static inline void send_callback(encoder_t *enc, encoder_event_type_t type) {
  uint32_t now = xTaskGetTickCountFromISR();
  uint32_t debounce_ticks = pdMS_TO_TICKS(enc->config.debounce_interval);

  if ((now - enc->state.last_time) >= debounce_ticks || type == EVENT_CALIBRATION_CHANGE) {
    enc->state.last_time = now;
    encoder_event_t event = {.source = enc, .type = type};
    xQueueSendFromISR(enc->queue, &event, NULL);
  }
}

static inline void set_cal_state(encoder_t *encoder, calibration_state_t cal_state) {
  calibration_state_t current_state = encoder->state.cal_state;
  encoder->state.cal_state = cal_state;
  if (current_state != cal_state) {
    send_callback(encoder, EVENT_CALIBRATION_CHANGE);
  }
}

static inline void encoder_calibration_step(encoder_t *enc, int32_t delta_raw) {
  if (delta_raw == 0) return;

  int32_t debounce_steps = enc->config.calibration_debounce_steps;
  if (debounce_steps < 0) debounce_steps = 0;

  rotation_dir_t dir = detect_dir(delta_raw);
  int32_t logical = enc->state.raw_count + enc->state.offset;
  int32_t dist = logical - enc->state.start_count;
  int32_t abs_dist = dist < 0 ? -dist : dist;
  int32_t step = delta_raw < 0 ? -delta_raw : delta_raw;

  switch (enc->state.cal_state) {
  case CAL_IDLE:
    if (enc->state.cal_dir != DIR_NONE && dir != enc->state.cal_dir) {
      enc->state.reverse_accum = 0;
    }
    enc->state.cal_dir = dir;
    enc->state.reverse_accum += step;

    if (enc->state.reverse_accum >= debounce_steps) {
      enc->state.start_count =
        logical -
        (enc->state.cal_dir == DIR_POSITIVE ? enc->state.reverse_accum : -enc->state.reverse_accum);
      enc->state.max_distance = 0;
      enc->state.reverse_accum = 0;
      set_cal_state(enc, CAL_SEEK_MAX);
    }
    break;

  case CAL_SEEK_MAX:
    if (abs_dist > enc->state.max_distance) enc->state.max_distance = abs_dist;

    if (dir == enc->state.cal_dir) {
      enc->state.reverse_accum = 0;
    } else {
      enc->state.reverse_accum += step;
      if (enc->state.reverse_accum >= debounce_steps && enc->state.max_distance > 0) {
        set_cal_state(enc, CAL_DONE);
      }
    }
    break;

  case CAL_DONE:
    break;
  }
}

static inline void encoder_update_calibrated(encoder_t *enc) {
  if (enc->state.cal_state != CAL_DONE || enc->state.max_distance <= 0) {
    enc->state.calibrated = CAL_MIN;
    return;
  }

  int32_t logical = enc->state.raw_count + enc->state.offset;
  int32_t dist = logical - enc->state.start_count;

  if (enc->state.cal_dir == DIR_NEGATIVE) {
    dist = -dist;
  }

  double norm = (double) dist / (double) enc->state.max_distance;
  enc->state.calibrated = CAL_MIN + norm * (CAL_MAX - CAL_MIN);
}

static void IRAM_ATTR rotation_handler(void *arg) {
  encoder_t *enc = (encoder_t *) arg;

  int32_t prev_raw = enc->state.raw_count;

  if (gpio_get_level(enc->config.pin_b))
    enc->state.raw_count++;
  else
    enc->state.raw_count--;

  int32_t delta_raw = enc->state.raw_count - prev_raw;

  encoder_calibration_step(enc, delta_raw);
  encoder_update_calibrated(enc);

  send_callback(enc, EVENT_ROTATION);
}

static void IRAM_ATTR reset_handler(void *arg) {
  encoder_t *enc = (encoder_t *) arg;
  if (enc->state.cal_state < CAL_DONE) return;

  int32_t logical_before = enc->state.raw_count + enc->state.offset;

  enc->state.raw_count = 0;
  enc->state.offset = logical_before;
  enc->state.z_seen = true;
}

void encoder_reset_calibration(encoder_t *enc) {
  ESP_LOGI("ENCODER", "Cleared calibration");
  set_cal_state(enc, CAL_IDLE);
  enc->state.cal_dir = DIR_NONE;
  enc->state.start_count = enc->state.raw_count + enc->state.offset;
  enc->state.max_distance = 0;
  enc->state.reverse_accum = 0;
  enc->state.z_seen = false;
  enc->state.calibrated = CAL_MIN;
}

encoder_t *init_encoder(encoder_config_t enc_config) {
  gpio_config_t io_conf = {};
  io_conf.intr_type = GPIO_INTR_NEGEDGE;
  io_conf.pin_bit_mask =
    ((1ULL << (uint64_t) enc_config.pin_a) | (1ULL << (uint64_t) enc_config.pin_b) |
     (1ULL << (uint64_t) enc_config.pin_z));
  io_conf.mode = GPIO_MODE_INPUT;
  gpio_config(&io_conf);

  encoder_t *enc = calloc(1, sizeof(encoder_t));
  if (!enc) return NULL;

  enc->config = enc_config;
  enc->state.raw_count = 0;
  enc->state.offset = 0;
  enc->state.last_time = 0;
  set_cal_state(enc, CAL_IDLE);
  enc->state.cal_dir = DIR_NONE;
  enc->state.start_count = 0;
  enc->state.max_distance = 0;
  enc->state.reverse_accum = 0;
  enc->state.z_seen = false;
  enc->state.calibrated = CAL_MIN;
  enc->queue = xQueueCreate(8, sizeof(encoder_event_t));

  gpio_install_isr_service(0);
  gpio_isr_handler_add(enc_config.pin_a, rotation_handler, enc);
  gpio_isr_handler_add(enc_config.pin_z, reset_handler, enc);

  xTaskCreate(event_consumer_task, "event_consumer_task", 4096, enc->queue, 5, NULL);

  return enc;
}

#endif
