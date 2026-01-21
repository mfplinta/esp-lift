#ifndef SETTINGS_H
#define SETTINGS_H

#include <cJSON.h>

typedef struct {
  const char *ssid;
  const char *password;
  const char *hostname;
} settings_t;

int config_load_settings(cJSON *root, settings_t *settings) {
  const cJSON *wifi = cJSON_GetObjectItemCaseSensitive(root, "wifi");
  if (cJSON_IsObject(wifi)) {
    const cJSON *ssid = cJSON_GetObjectItemCaseSensitive(wifi, "ssid");
    const cJSON *password = cJSON_GetObjectItemCaseSensitive(wifi, "password");
    const cJSON *hostname = cJSON_GetObjectItemCaseSensitive(wifi, "hostname");

    settings->ssid = cJSON_IsString(ssid) ? ssid->valuestring : NULL;

    settings->password = cJSON_IsString(password) ? password->valuestring : NULL;

    settings->hostname = cJSON_IsString(hostname) ? hostname->valuestring : NULL;
  } else {
    settings->ssid = NULL;
    settings->password = NULL;
    settings->hostname = NULL;
  }

  return 1;
}

#endif