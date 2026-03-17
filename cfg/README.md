# Configuration

If connecting Wi-Fi to a router is desired, be sure to fill `settings.json` with your Wi-Fi SSID and password based on the given template.

Create it from the template with:

```sh
cp settings.template.json settings.json
```

Also feel free to add predefined exercises inside `exercises.json`.

## Custom HTTPS Certificate

By default the device generates a self-signed ECDSA certificate on first boot
(and regenerates it whenever the hostname or IP addresses change).

To use your own certificate instead, place these two PEM files in this
directory **before building**:

- `https_custom_cert.pem` — the certificate (or full chain)
- `https_custom_key.pem` — the corresponding private key

They will be flashed into the `cfg` LittleFS partition alongside the other
configuration files. When the device boots and finds both files, it will use
them as-is and **skip all automatic certificate generation**, even when the
network configuration changes.

To revert to auto-generated certificates, simply remove the two files and
rebuild.
