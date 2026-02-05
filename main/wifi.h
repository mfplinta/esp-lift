#ifndef WIFI_H
#define WIFI_H

#include <esp_event.h>
#include <esp_log.h>
#include <esp_mac.h>
#include <esp_netif.h>
#include <esp_wifi.h>
#include <nvs_flash.h>

#include "dns_server.h"

static const char *TAG_WIFI = "WIFI";
esp_netif_t *ap_netif = NULL;

/* ---------- AP defaults ---------- */
#define WIFI_AP_SSID "ESP-LIFT"
#define WIFI_AP_PASSWORD "esp-lift"
#define WIFI_AP_CHANNEL 1
#define WIFI_AP_MAX_CONN 4

/* ---------- Event handler ---------- */
static void wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id,
                               void *event_data) {
  if (event_base == WIFI_EVENT) {

    switch (event_id) {

    case WIFI_EVENT_STA_START:
      ESP_LOGI(TAG_WIFI, "STA started, connecting...");
      esp_wifi_connect();
      break;

    case WIFI_EVENT_STA_DISCONNECTED:
      ESP_LOGW(TAG_WIFI, "STA disconnected, retrying...");
      esp_wifi_connect();
      break;

    case WIFI_EVENT_AP_START:
      ESP_LOGI(TAG_WIFI, "AP started");
      esp_netif_ip_info_t ip;
      esp_netif_get_ip_info(ap_netif, &ip);
      captive_dns_start(ip.ip.addr);
      ESP_LOGI(TAG_WIFI, "Captive DNS started");
      break;
      break;

    case WIFI_EVENT_AP_STACONNECTED: {
      wifi_event_ap_staconnected_t *e = event_data;
      ESP_LOGI(TAG_WIFI, "AP client connected: " MACSTR, MAC2STR(e->mac));
      break;
    }

    case WIFI_EVENT_AP_STADISCONNECTED: {
      wifi_event_ap_stadisconnected_t *e = event_data;
      ESP_LOGI(TAG_WIFI, "AP client disconnected: " MACSTR, MAC2STR(e->mac));
      break;
    }

    default:
      break;
    }
  }

  if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
    ip_event_got_ip_t *event = event_data;
    ESP_LOGI(TAG_WIFI, "STA IP acquired: " IPSTR, IP2STR(&event->ip_info.ip));
  }
}

/* ---------- Init ---------- */
static inline void init_wifi(wifi_config_t *sta_cfg, const char *hostname) {
  /* NVS */
  esp_err_t ret = nvs_flash_init();
  if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    ESP_ERROR_CHECK(nvs_flash_init());
  }

  ESP_ERROR_CHECK(esp_netif_init());
  ESP_ERROR_CHECK(esp_event_loop_create_default());

  /* Netifs */
  esp_netif_t *sta_netif = esp_netif_create_default_wifi_sta();
  ap_netif = esp_netif_create_default_wifi_ap();

  if (hostname) {
    esp_netif_set_hostname(sta_netif, hostname);
  }

  /* WiFi init */
  wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
  ESP_ERROR_CHECK(esp_wifi_init(&cfg));

  /* Events */
  ESP_ERROR_CHECK(
    esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL));
  ESP_ERROR_CHECK(
    esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL));

  esp_wifi_set_mode(WIFI_MODE_APSTA);

  /* ---------- STA config ---------- */
  ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, sta_cfg));

  /* ---------- AP config ---------- */
  wifi_config_t ap_cfg = {.ap = {.ssid = WIFI_AP_SSID,
                                 .ssid_len = strlen(WIFI_AP_SSID),
                                 .password = WIFI_AP_PASSWORD,
                                 .channel = WIFI_AP_CHANNEL,
                                 .max_connection = WIFI_AP_MAX_CONN,
                                 .authmode = WIFI_AUTH_WPA2_PSK}};

  if (strlen(WIFI_AP_PASSWORD) == 0) {
    ap_cfg.ap.authmode = WIFI_AUTH_OPEN;
  }

  ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap_cfg));

  /* Mode + start */
  ESP_ERROR_CHECK(esp_wifi_start());

  ESP_LOGI(TAG_WIFI, "WiFi initialized (AP+STA)");
}

#endif
