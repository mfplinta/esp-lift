#ifndef SETTINGS_H
#define SETTINGS_H

#include <cJSON.h>
#include <stdlib.h>

#define DEBOUNCE_MS 100
#define DEFAULT_HOSTNAME "esp-lift.arpa"

typedef struct {
  const char *ssid;
  const char *password;
  const char *hostname;

  int debounce_interval;
} settings_t;

int config_load_settings(cJSON *root, settings_t *settings) {
  const cJSON *network = cJSON_GetObjectItem(root, "network");
  if (cJSON_IsObject(network)) {
    const cJSON *ssid = cJSON_GetObjectItem(network, "ssid");
    const cJSON *password = cJSON_GetObjectItem(network, "password");
    const cJSON *hostname = cJSON_GetObjectItem(network, "hostname");

    settings->ssid = cJSON_IsString(ssid) ? ssid->valuestring : "nothing";

    settings->password = cJSON_IsString(password) ? password->valuestring : "nothing";

    settings->hostname = cJSON_IsString(hostname) ? hostname->valuestring : DEFAULT_HOSTNAME;
  }

  const cJSON *movement = cJSON_GetObjectItem(root, "movement");
  if (cJSON_IsObject(movement)) {
    const cJSON *debounce_interval = cJSON_GetObjectItem(movement, "debounceInterval");

    settings->debounce_interval = cJSON_IsNumber(debounce_interval) ? debounce_interval->valueint : DEBOUNCE_MS;
  }

  return 1;
}

int config_change_settings(cJSON *root, cJSON *patch) {
  const cJSON *network = cJSON_GetObjectItem(patch, "network");
  if (cJSON_IsObject(network)) {
    cJSON *dst = cJSON_GetObjectItem(root, "network");

    cJSON *item;
    if ((item = cJSON_GetObjectItem(network, "ssid")))
      if (cJSON_IsString(item))
        cJSON_ReplaceItemInObject(dst, "ssid", cJSON_Duplicate(item, 1));

    if ((item = cJSON_GetObjectItem(network, "password")))
      if (cJSON_IsString(item))
        cJSON_ReplaceItemInObject(dst, "password", cJSON_Duplicate(item, 1));

    if ((item = cJSON_GetObjectItem(network, "hostname")))
      if (cJSON_IsString(item))
        cJSON_ReplaceItemInObject(dst, "hostname", cJSON_Duplicate(item, 1));
  }

  const cJSON *movement = cJSON_GetObjectItem(patch, "movement");
  if (cJSON_IsObject(movement)) {
    cJSON *dst = cJSON_GetObjectItem(root, "movement");

    cJSON *item;
    if ((item = cJSON_GetObjectItem(movement, "debounceInterval")))
      if (cJSON_IsNumber(item))
        cJSON_ReplaceItemInObject(dst, "debounceInterval", cJSON_Duplicate(item, 1));
  }

  return 1;
}

/**
 * Must be freed by caller
 */
int config_sanitize_settings(cJSON *root) {
  cJSON *network = NULL;
  if(!(network = cJSON_GetObjectItem(root, "network"))) {
    cJSON_DeleteItemFromObject(network, "ssid");
    cJSON_DeleteItemFromObject(network, "password");
    return 0;
  }

  return 1;
}

#endif