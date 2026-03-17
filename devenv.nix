{ pkgs, inputs, ... }:

let
  programmingBaudRate = 921600;
  monitorBaudRate = 921600;
  pkgsPy310 = import inputs.nixpkgs-py310 {
    system = pkgs.stdenv.hostPlatform.system;
    config = {};
  };
in
{
  overlays = [
    (final: prev: { python310 = pkgsPy310.python310; })
    inputs.esp-dev.overlays.default
  ];
  packages = [ pkgs.esp-idf-full ];

  enterShell = ''
    echo "$(idf.py --version) | IDF_PATH: $IDF_PATH"
  '';

  scripts.build.exec = ''
    set -e

    BUILD_ONLY=0
    FLASH_SIZE="4mb"
    MERGE_FLAG=""
    
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
        --merge-flag=*)
          MERGE_FLAG="''${1#*=}"
          shift
          ;;
        --merge-flag)
          if [ -z "$2" ]; then
            echo "Error: --merge-flag requires a value"
            exit 1
          fi
          MERGE_FLAG="$2"
          shift 2
          ;;
        *)
          echo "Error: Unknown argument '$1'"
          exit 1
          ;;
      esac
    done

    case "$FLASH_SIZE" in
      2mb|4mb)
        ;;
      *)
        echo "Invalid --flash-size value: $FLASH_SIZE (use 2mb or 4mb)"
        exit 1
        ;;
    esac

    set_common_config() {
      sed -i \
        -e 's/^.*CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH=.*/CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH=y/' \
        -e 's/^# CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH is not set.*/CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH=y/' \
        -e 's/^.*CONFIG_ESP_SYSTEM_PANIC_PRINT_REBOOT=.*/# CONFIG_ESP_SYSTEM_PANIC_PRINT_REBOOT is not set/' \
        -e 's/^.*CONFIG_ESP_SYSTEM_PANIC_GDBSTUB=.*/# CONFIG_ESP_SYSTEM_PANIC_GDBSTUB is not set/' \
        -e 's/^.*CONFIG_ESP_SYSTEM_PANIC_SILENT_REBOOT=.*/# CONFIG_ESP_SYSTEM_PANIC_SILENT_REBOOT is not set/' \
        -e 's/^.*CONFIG_ESP_SYSTEM_PANIC_NONE=.*/# CONFIG_ESP_SYSTEM_PANIC_NONE is not set/' \
        -e 's/^.*CONFIG_ESP_SYSTEM_PANIC_PRINT_HALT=.*/CONFIG_ESP_SYSTEM_PANIC_PRINT_HALT=y/' \
        -e 's/^CONFIG_ESP_SYSTEM_EVENT_TASK_STACK_SIZE=.*/CONFIG_ESP_SYSTEM_EVENT_TASK_STACK_SIZE=4096/' \
        -e 's/^.*CONFIG_PARTITION_TABLE_SINGLE_APP=.*/# CONFIG_PARTITION_TABLE_SINGLE_APP is not set/' \
        -e 's/^.*CONFIG_PARTITION_TABLE_CUSTOM is not set.*/CONFIG_PARTITION_TABLE_CUSTOM=y/' \
        -e 's/^# CONFIG_HTTPD_WS_SUPPORT is not set.*/CONFIG_HTTPD_WS_SUPPORT=y/' \
        -e 's/^CONFIG_HTTPD_WS_SUPPORT=.*/CONFIG_HTTPD_WS_SUPPORT=y/' \
        -e 's/^CONFIG_LWIP_MAX_SOCKETS=.*/CONFIG_LWIP_MAX_SOCKETS=32/' \
        sdkconfig
    }

    set_2mb() {
      set_common_config
      sed -i \
        -e 's/^CONFIG_ESPTOOLPY_FLASHSIZE=.*/CONFIG_ESPTOOLPY_FLASHSIZE="2MB"/' \
        -e 's/^.*CONFIG_ESPTOOLPY_FLASHSIZE_4MB.*/# CONFIG_ESPTOOLPY_FLASHSIZE_4MB is not set/' \
        -e 's/^.*CONFIG_ESPTOOLPY_FLASHSIZE_2MB.*/CONFIG_ESPTOOLPY_FLASHSIZE_2MB=y/' \
        -e 's/^.*CONFIG_PARTITION_TABLE_FILENAME=.*/CONFIG_PARTITION_TABLE_FILENAME="partitions-2mb.csv"/' \
        -e 's/^.*CONFIG_PARTITION_TABLE_CUSTOM_FILENAME=.*/CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="partitions-2mb.csv"/' \
        sdkconfig
    }

    set_4mb() {
      set_common_config
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
        -e 's/^.*CONFIG_ESP_HTTPS_SERVER_ENABLE.*/CONFIG_ESP_HTTPS_SERVER_ENABLE=y/' \
        -e 's/^.*CONFIG_ESP_TLS_SERVER_SESSION_TICKETS.*/CONFIG_ESP_TLS_SERVER_SESSION_TICKETS=y/' \
        -e 's/^CONFIG_MONITOR_BAUD=.*/CONFIG_MONITOR_BAUD=${toString monitorBaudRate}/' \
        -e 's/^CONFIG_ESPTOOLPY_MONITOR_BAUD=.*/CONFIG_ESPTOOLPY_MONITOR_BAUD=${toString monitorBaudRate}/' \
        -e 's/^# CONFIG_ESP_CONSOLE_UART_CUSTOM.*/CONFIG_ESP_CONSOLE_UART_CUSTOM=y/' \
        -e 's/^CONFIG_ESP_CONSOLE_UART_BAUDRATE=.*/CONFIG_ESP_CONSOLE_UART_BAUDRATE=${toString monitorBaudRate}\nCONFIG_ESP_CONSOLE_UART_TX_GPIO=1\nCONFIG_ESP_CONSOLE_UART_RX_GPIO=3/' \
        -e 's/^# CONFIG_CONSOLE_UART_CUSTOM.*/CONFIG_CONSOLE_UART_CUSTOM=y/' \
        -e 's/^CONFIG_CONSOLE_UART_BAUDRATE=.*/CONFIG_CONSOLE_UART_BAUDRATE=${toString monitorBaudRate}\nCONFIG_CONSOLE_UART_TX_GPIO=1\nCONFIG_CONSOLE_UART_RX_GPIO=3/' \
        sdkconfig

      set_4mb
    fi

    echo "Applying flash size: $FLASH_SIZE"

    if [ "$FLASH_SIZE" = "2mb" ]; then
      set_2mb
    else
      set_4mb
    fi

    (
      cd web_app
      [ -d node_modules ] || npm i
      npx prettier --write .
      vite build
    )

    (
      [ -f cfg/settings.json ] || cp cfg/settings.template.json cfg/settings.json
      cd main
      clang-format -i *.c *.h
    )

    idf.py build

    if [ -n "$MERGE_FLAG" ]; then
      idf.py merge-bin $MERGE_FLAG
    else
      idf.py merge-bin
    fi

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
