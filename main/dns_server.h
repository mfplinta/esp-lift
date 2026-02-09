#ifndef DNS_SERVER_H
#define DNS_SERVER_H

#include <lwip/ip_addr.h>
#include <lwip/udp.h>
#include <string.h>

#define DNS_PORT 53
#define DNS_MAX_LEN 256

static struct udp_pcb *dns_pcb;
static ip_addr_t reply_ip;

static void dns_recv(void *arg, struct udp_pcb *pcb, struct pbuf *p, const ip_addr_t *addr,
                     u16_t port) {
  if (!p) return;

  uint8_t *req = (uint8_t *) p->payload;

  // Minimal DNS response: copy query, set response flag
  req[2] |= 0x80; // QR = response
  req[3] |= 0x80; // RA

  // Answer count = 1
  req[6] = 0x00;
  req[7] = 0x01;

  // Append answer
  uint8_t ans[] = {
    0xC0, 0x0C,             // pointer to name
    0x00, 0x01,             // type A
    0x00, 0x01,             // class IN
    0x00, 0x00, 0x00, 0x3C, // TTL
    0x00, 0x04              // length
  };

  struct pbuf *resp = pbuf_alloc(PBUF_TRANSPORT, p->len + sizeof(ans) + 4, PBUF_RAM);

  memcpy(resp->payload, req, p->len);
  memcpy((uint8_t *) resp->payload + p->len, ans, sizeof(ans));
  memcpy((uint8_t *) resp->payload + p->len + sizeof(ans), &reply_ip.u_addr.ip4.addr, 4);

  udp_sendto(pcb, resp, addr, port);
  pbuf_free(resp);
  pbuf_free(p);
}

void captive_dns_start(uint32_t ip) {
  ip4_addr_set_u32(ip_2_ip4(&reply_ip), ip);

  dns_pcb = udp_new();
  udp_bind(dns_pcb, IP_ADDR_ANY, DNS_PORT);
  udp_recv(dns_pcb, dns_recv, NULL);
}

#endif