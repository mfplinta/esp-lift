#ifndef TLS_CERT_H
#define TLS_CERT_H

#include <esp_err.h>
#include <stdbool.h>
#include <stddef.h>

typedef struct {
  char *cert_pem;
  size_t cert_len;
  char *key_pem;
  size_t key_len;
} tls_cert_bundle_t;

#include <arpa/inet.h>
#include <esp_log.h>
#include <mbedtls/asn1write.h>
#include <mbedtls/ctr_drbg.h>
#include <mbedtls/ecp.h>
#include <mbedtls/entropy.h>
#include <mbedtls/md.h>
#include <mbedtls/oid.h>
#include <mbedtls/pem.h>
#include <mbedtls/pk.h>
#include <mbedtls/x509.h>
#include <mbedtls/x509_crt.h>
#include <stdbool.h>
#include <string.h>
#include <sys/stat.h>

#include "data/settings.h"
#include "utils.h"

#define TLS_CERT_PATH "/cfg/https_cert.pem"
#define TLS_KEY_PATH "/cfg/https_key.pem"
#define TLS_SAN_PATH "/cfg/https_san.json"

#define TLS_CERT_BUFFER_SIZE 4096
#define TLS_KEY_BUFFER_SIZE 2048

static const char *TAG_TLS = "TLS_CERT";
static char g_hostname[64] = DEFAULT_HOSTNAME;

typedef struct {
  char hostname[64];
  char ap_ip[16];
  char sta_ip[16];
} tls_san_info_t;

static bool file_exists(const char *path) {
  struct stat st;
  return stat(path, &st) == 0;
}

static void sanitize_san_value(const char *input, char *output, size_t out_len) {
  if (!input || out_len == 0) return;
  output[0] = '\0';

  size_t input_len = strlen(input);
  if (input_len >= out_len) input_len = out_len - 1;

  memcpy(output, input, input_len);
  output[input_len] = '\0';
}

static esp_err_t load_san_info(tls_san_info_t *out) {
  if (!out) return ESP_ERR_INVALID_ARG;
  cJSON *json = cjson_read_from_file(TLS_SAN_PATH);
  if (!json) return ESP_FAIL;

  const cJSON *hostname = cJSON_GetObjectItem(json, "hostname");
  const cJSON *ap_ip = cJSON_GetObjectItem(json, "ap_ip");
  const cJSON *sta_ip = cJSON_GetObjectItem(json, "sta_ip");

  sanitize_san_value(cJSON_IsString(hostname) ? hostname->valuestring : "", out->hostname,
                     sizeof(out->hostname));
  sanitize_san_value(cJSON_IsString(ap_ip) ? ap_ip->valuestring : "", out->ap_ip,
                     sizeof(out->ap_ip));
  sanitize_san_value(cJSON_IsString(sta_ip) ? sta_ip->valuestring : "", out->sta_ip,
                     sizeof(out->sta_ip));

  cJSON_Delete(json);
  return ESP_OK;
}

static esp_err_t save_san_info(const tls_san_info_t *info) {
  if (!info) return ESP_ERR_INVALID_ARG;

  cJSON *root = cJSON_CreateObject();
  if (!root) return ESP_ERR_NO_MEM;

  cJSON_AddStringToObject(root, "hostname", info->hostname);
  cJSON_AddStringToObject(root, "ap_ip", info->ap_ip);
  cJSON_AddStringToObject(root, "sta_ip", info->sta_ip);

  int res = cjson_save_to_file(root, TLS_SAN_PATH);
  cJSON_Delete(root);

  return res == 0 ? ESP_OK : ESP_FAIL;
}

static bool san_info_matches(const tls_san_info_t *a, const tls_san_info_t *b) {
  if (!a || !b) return false;
  return strcmp(a->hostname, b->hostname) == 0 && strcmp(a->ap_ip, b->ap_ip) == 0 &&
         strcmp(a->sta_ip, b->sta_ip) == 0;
}

static int asn1_write_general_name(unsigned char **p, const unsigned char *start, int tag,
                                   const unsigned char *data, size_t len) {
  int ret = mbedtls_asn1_write_raw_buffer(p, start, data, len);
  if (ret < 0) return ret;
  ret = mbedtls_asn1_write_len(p, start, len);
  if (ret < 0) return ret;
  ret = mbedtls_asn1_write_tag(p, start, tag);
  if (ret < 0) return ret;
  return 0;
}

static int build_subject_alt_name(unsigned char *buf, size_t buf_len, const tls_san_info_t *san,
                                  unsigned char **out_ptr, size_t *out_len) {
  unsigned char *p = buf + buf_len;
  size_t total_len = 0;

  if (san->sta_ip[0] != '\0') {
    struct in_addr addr;
    if (inet_aton(san->sta_ip, &addr) == 1) {
      uint8_t ip_bytes[4];
      memcpy(ip_bytes, &addr.s_addr, sizeof(ip_bytes));
      unsigned char *before = p;
      int ret = asn1_write_general_name(&p, buf, MBEDTLS_ASN1_CONTEXT_SPECIFIC | 7, ip_bytes,
                                        sizeof(ip_bytes));
      if (ret < 0) return ret;
      total_len += (size_t) (before - p);
    }
  }

  if (san->ap_ip[0] != '\0') {
    struct in_addr addr;
    if (inet_aton(san->ap_ip, &addr) == 1) {
      uint8_t ip_bytes[4];
      memcpy(ip_bytes, &addr.s_addr, sizeof(ip_bytes));
      unsigned char *before = p;
      int ret = asn1_write_general_name(&p, buf, MBEDTLS_ASN1_CONTEXT_SPECIFIC | 7, ip_bytes,
                                        sizeof(ip_bytes));
      if (ret < 0) return ret;
      total_len += (size_t) (before - p);
    }
  }

  if (san->hostname[0] != '\0') {
    const unsigned char *name = (const unsigned char *) san->hostname;
    size_t name_len = strlen(san->hostname);
    unsigned char *before = p;
    int ret = asn1_write_general_name(&p, buf, MBEDTLS_ASN1_CONTEXT_SPECIFIC | 2, name, name_len);
    if (ret < 0) return ret;
    total_len += (size_t) (before - p);
  }

  if (total_len == 0) return -1;

  int ret = mbedtls_asn1_write_len(&p, buf, total_len);
  if (ret < 0) return ret;
  ret = mbedtls_asn1_write_tag(&p, buf, MBEDTLS_ASN1_CONSTRUCTED | MBEDTLS_ASN1_SEQUENCE);
  if (ret < 0) return ret;

  *out_ptr = p;
  *out_len = buf + buf_len - p;
  return 0;
}

static int generate_self_signed_ecdsa(const tls_san_info_t *san, char **cert_pem, size_t *cert_len,
                                      char **key_pem, size_t *key_len) {
  int ret = 0;
  mbedtls_pk_context key;
  mbedtls_x509write_cert crt;
  mbedtls_entropy_context entropy;
  mbedtls_ctr_drbg_context ctr_drbg;

  unsigned char *cert_buf = NULL;
  unsigned char *key_buf = NULL;
  unsigned char san_buf[256];
  unsigned char *san_ptr = NULL;
  size_t san_len = 0;

  mbedtls_pk_init(&key);
  mbedtls_x509write_crt_init(&crt);
  mbedtls_entropy_init(&entropy);
  mbedtls_ctr_drbg_init(&ctr_drbg);

  if (cert_pem) *cert_pem = NULL;
  if (key_pem) *key_pem = NULL;

  cert_buf = malloc(TLS_CERT_BUFFER_SIZE);
  key_buf = malloc(TLS_KEY_BUFFER_SIZE);
  if (!cert_buf || !key_buf) {
    ret = -1;
    goto cleanup;
  }

  const char *pers = "esp_lift_tls";
  if ((ret = mbedtls_ctr_drbg_seed(&ctr_drbg, mbedtls_entropy_func, &entropy,
                                   (const unsigned char *) pers, strlen(pers))) != 0) {
    goto cleanup;
  }

  if ((ret = mbedtls_pk_setup(&key, mbedtls_pk_info_from_type(MBEDTLS_PK_ECKEY))) != 0) {
    goto cleanup;
  }

  if ((ret = mbedtls_ecp_gen_key(MBEDTLS_ECP_DP_SECP256R1, mbedtls_pk_ec(key),
                                 mbedtls_ctr_drbg_random, &ctr_drbg)) != 0) {
    goto cleanup;
  }

  unsigned char serial_buf[16];
  if ((ret = mbedtls_ctr_drbg_random(&ctr_drbg, serial_buf, sizeof(serial_buf))) != 0) {
    goto cleanup;
  }

  char subject[96];
  const char *hostname = san->hostname[0] != '\0' ? san->hostname : DEFAULT_HOSTNAME;
  snprintf(subject, sizeof(subject), "CN=%s", hostname);

  mbedtls_x509write_crt_set_subject_key(&crt, &key);
  mbedtls_x509write_crt_set_issuer_key(&crt, &key);
  mbedtls_x509write_crt_set_subject_name(&crt, subject);
  mbedtls_x509write_crt_set_issuer_name(&crt, subject);
  mbedtls_x509write_crt_set_md_alg(&crt, MBEDTLS_MD_SHA256);
  mbedtls_x509write_crt_set_version(&crt, MBEDTLS_X509_CRT_VERSION_3);
  if ((ret = mbedtls_x509write_crt_set_serial_raw(&crt, serial_buf, sizeof(serial_buf))) != 0) {
    goto cleanup;
  }
  mbedtls_x509write_crt_set_validity(&crt, "20240101000000", "20340101000000");

  if ((ret = build_subject_alt_name(san_buf, sizeof(san_buf), san, &san_ptr, &san_len)) != 0) {
    goto cleanup;
  }

  if ((ret = mbedtls_x509write_crt_set_extension(&crt, MBEDTLS_OID_SUBJECT_ALT_NAME,
                                                 MBEDTLS_OID_SIZE(MBEDTLS_OID_SUBJECT_ALT_NAME), 0,
                                                 san_ptr, san_len)) != 0) {
    goto cleanup;
  }

  memset(cert_buf, 0, TLS_CERT_BUFFER_SIZE);
  ret = mbedtls_x509write_crt_pem(&crt, cert_buf, TLS_CERT_BUFFER_SIZE, mbedtls_ctr_drbg_random,
                                  &ctr_drbg);
  if (ret != 0) {
    goto cleanup;
  }

  memset(key_buf, 0, TLS_KEY_BUFFER_SIZE);
  ret = mbedtls_pk_write_key_pem(&key, key_buf, TLS_KEY_BUFFER_SIZE);
  if (ret != 0) {
    goto cleanup;
  }

  size_t cert_size = strlen((char *) cert_buf) + 1;
  size_t key_size = strlen((char *) key_buf) + 1;

  *cert_pem = malloc(cert_size);
  *key_pem = malloc(key_size);
  if (!*cert_pem || !*key_pem) {
    ret = -1;
    goto cleanup;
  }

  memcpy(*cert_pem, cert_buf, cert_size);
  memcpy(*key_pem, key_buf, key_size);
  if (cert_len) *cert_len = cert_size;
  if (key_len) *key_len = key_size;

cleanup:
  if (ret != 0) {
    if (*cert_pem) {
      free(*cert_pem);
      *cert_pem = NULL;
    }
    if (*key_pem) {
      free(*key_pem);
      *key_pem = NULL;
    }
  }

  if (cert_buf) free(cert_buf);
  if (key_buf) free(key_buf);

  mbedtls_pk_free(&key);
  mbedtls_x509write_crt_free(&crt);
  mbedtls_ctr_drbg_free(&ctr_drbg);
  mbedtls_entropy_free(&entropy);

  return ret;
}

esp_err_t tls_cert_set_hostname(const char *hostname) {
  if (!hostname || hostname[0] == '\0') {
    strncpy(g_hostname, DEFAULT_HOSTNAME, sizeof(g_hostname));
    g_hostname[sizeof(g_hostname) - 1] = '\0';
    return ESP_OK;
  }

  strncpy(g_hostname, hostname, sizeof(g_hostname));
  g_hostname[sizeof(g_hostname) - 1] = '\0';
  return ESP_OK;
}

const char *tls_cert_get_hostname(void) { return g_hostname; }

static void build_desired_san(tls_san_info_t *out, const char *ap_ip, const char *sta_ip) {
  sanitize_san_value(g_hostname, out->hostname, sizeof(out->hostname));
  sanitize_san_value(ap_ip ? ap_ip : "", out->ap_ip, sizeof(out->ap_ip));
  sanitize_san_value(sta_ip ? sta_ip : "", out->sta_ip, sizeof(out->sta_ip));
}

esp_err_t tls_cert_regenerate(const char *ap_ip, const char *sta_ip) {
  tls_san_info_t desired = {0};
  build_desired_san(&desired, ap_ip, sta_ip);

  char *cert = NULL;
  char *key = NULL;
  size_t cert_len = 0;
  size_t key_len = 0;

  int ret = generate_self_signed_ecdsa(&desired, &cert, &cert_len, &key, &key_len);
  if (ret != 0) {
    ESP_LOGE(TAG_TLS, "Failed to generate cert: %d", ret);
    return ESP_FAIL;
  }

  esp_err_t err = write_buf_to_file(TLS_CERT_PATH, cert, cert_len - 1);
  if (err != ESP_OK) {
    free(cert);
    free(key);
    return err;
  }

  err = write_buf_to_file(TLS_KEY_PATH, key, key_len - 1);
  if (err != ESP_OK) {
    free(cert);
    free(key);
    return err;
  }

  err = save_san_info(&desired);
  free(cert);
  free(key);

  return err;
}

esp_err_t tls_cert_ensure(const char *ap_ip, const char *sta_ip, tls_cert_bundle_t *out) {
  if (!out) return ESP_ERR_INVALID_ARG;

  out->cert_pem = NULL;
  out->key_pem = NULL;
  out->cert_len = 0;
  out->key_len = 0;

  tls_san_info_t desired = {0};
  build_desired_san(&desired, ap_ip, sta_ip);

  tls_san_info_t current = {0};
  bool have_san = load_san_info(&current) == ESP_OK;
  bool have_files = file_exists(TLS_CERT_PATH) && file_exists(TLS_KEY_PATH);

  if (!(have_files && have_san && san_info_matches(&current, &desired))) {
    ESP_LOGI(TAG_TLS, "Regenerating HTTPS certificate");
    if (tls_cert_regenerate(ap_ip, sta_ip) != ESP_OK) {
      return ESP_FAIL;
    }
  }

  if (read_file_to_buf(TLS_CERT_PATH, &out->cert_pem, &out->cert_len) != ESP_OK) return ESP_FAIL;
  if (read_file_to_buf(TLS_KEY_PATH, &out->key_pem, &out->key_len) != ESP_OK) {
    free(out->cert_pem);
    out->cert_pem = NULL;
    return ESP_FAIL;
  }

  return ESP_OK;
}

void tls_cert_free(tls_cert_bundle_t *bundle) {
  if (!bundle) return;
  if (bundle->cert_pem) free(bundle->cert_pem);
  if (bundle->key_pem) free(bundle->key_pem);
  bundle->cert_pem = NULL;
  bundle->key_pem = NULL;
  bundle->cert_len = 0;
  bundle->key_len = 0;
}

#endif
