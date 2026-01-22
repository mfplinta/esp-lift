{ pkgs, inputs, ... }:

let
  programmingBaudRate = 921600;
  monitorBaudRate = 921600;
in
{
  overlays = [ inputs.esp-dev.overlays.default ];
  packages = [ pkgs.esp-idf-full ];

  enterShell = ''
    echo "$(idf.py --version) | IDF_PATH: $IDF_PATH"
  '';

  scripts.build.exec = ''
    set -e

    BUILD_ONLY=0
    FLASH_SIZE=""
    
    while [ "$#" -gt 0 ]; do
      case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
        --build-only)
          BUILD_ONLY=1
          shift
          ;;
        --flash-size=*)
          FLASH_SIZE="$(echo "''${1#*=}" | tr '[:upper:]' '[:lower:]')"
          shift
          ;;
        --flash-size)
          if [ -z "$2" ]; then
            echo "Error: --flash-size requires a value (e.g., 2mb or 4mb)"
            exit 1
          fi
          FLASH_SIZE="$(echo "$2" | tr '[:upper:]' '[:lower:]')"
          shift 2
          ;;
        *)
          echo "Error: Unknown argument '$1'"
          exit 1
          ;;
      esac
    done

    if [ -n "$FLASH_SIZE" ]; then
      case "$FLASH_SIZE" in
        2mb|4mb)
          ;;
        *)
          echo "Invalid --flash-size value: $FLASH_SIZE (use 2mb or 4mb)"
          exit 1
          ;;
      esac
    fi

    set_2mb() {
      sed -i \
        -e 's/^CONFIG_ESPTOOLPY_FLASHSIZE=.*/CONFIG_ESPTOOLPY_FLASHSIZE="2MB"/' \
        -e 's/^.*CONFIG_ESPTOOLPY_FLASHSIZE_4MB.*/# CONFIG_ESPTOOLPY_FLASHSIZE_4MB is not set/' \
        -e 's/^.*CONFIG_ESPTOOLPY_FLASHSIZE_2MB.*/CONFIG_ESPTOOLPY_FLASHSIZE_2MB=y/' \
        -e 's/^.*CONFIG_PARTITION_TABLE_FILENAME=.*/CONFIG_PARTITION_TABLE_FILENAME="partitions-2mb.csv"/' \
        -e 's/^.*CONFIG_PARTITION_TABLE_CUSTOM_FILENAME=.*/CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="partitions-2mb.csv"/' \
        sdkconfig
    }

    set_4mb() {
      sed -i \
        -e 's/^.*CONFIG_ESPTOOLPY_FLASHSIZE=.*/CONFIG_ESPTOOLPY_FLASHSIZE="4MB"/' \
        -e 's/^.*CONFIG_ESPTOOLPY_FLASHSIZE_4MB.*/CONFIG_ESPTOOLPY_FLASHSIZE_4MB=y/' \
        -e 's/^.*CONFIG_ESPTOOLPY_FLASHSIZE_2MB.*/# CONFIG_ESPTOOLPY_FLASHSIZE_2MB is not set/' \
        -e 's/^.*CONFIG_PARTITION_TABLE_FILENAME=.*/CONFIG_PARTITION_TABLE_FILENAME="partitions-4mb.csv"/' \
        -e 's/^.*CONFIG_PARTITION_TABLE_CUSTOM_FILENAME=.*/CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="partitions-4mb.csv"/' \
        sdkconfig
    }

    if [ ! -f sdkconfig ]; then
      idf.py reconfigure

      sed -i \
        -e 's/# CONFIG_PARTITION_TABLE_CUSTOM is not set*/CONFIG_PARTITION_TABLE_CUSTOM=y/' \
        -e 's/^.*CONFIG_HTTPD_WS_SUPPORT.*/CONFIG_HTTPD_WS_SUPPORT=y/' \
        -e 's/^CONFIG_MONITOR_BAUD=.*/CONFIG_MONITOR_BAUD=${toString monitorBaudRate}/' \
        -e 's/^CONFIG_ESPTOOLPY_MONITOR_BAUD=.*/CONFIG_ESPTOOLPY_MONITOR_BAUD=${toString monitorBaudRate}/' \
        -e 's/^CONFIG_ESP_CONSOLE_UART_BAUDRATE=.*/CONFIG_ESP_CONSOLE_UART_BAUDRATE=${toString monitorBaudRate}/' \
        sdkconfig

      set_4mb
    fi

    if [ -n "$FLASH_SIZE" ]; then
      echo "Applying flash size: $FLASH_SIZE"

      if [ "$FLASH_SIZE" = "2mb" ]; then
        set_2mb
      else
        set_4mb
      fi
    fi

    (
      cd web_app
      [ -d node_modules ] || npm i
      npx prettier --write .
      vite build
    )

    (
      [ -f cfg/config.json ] || cp cfg/config.template.json cfg/config.json
      cd main
      clang-format -i *.c *.h
    )

    idf.py build

    if [ "$BUILD_ONLY" -eq 0 ]; then
      idf.py -b ${toString programmingBaudRate} flash
      idf.py monitor
    fi
  '';
  
  languages.c.enable = true;
  languages.python.enable = true;
  languages.javascript = {
    enable = true;
    npm.enable = true;
  };
}