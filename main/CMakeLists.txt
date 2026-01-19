set(component_requires 
    esp_driver_gpio
    esp_driver_uart
    esp_wifi
    esp_http_server
    nvs_flash
)

idf_component_register(
    SRCS "main.c"
    INCLUDE_DIRS "."
    REQUIRES "${component_requires}"
)