{ pkgs, inputs, ... }:

let
  programmingBaudRate = 921600;
  monitorBaudRate = 921600;
  espBoard = "esp32s3";
in
{
  overlays = [
    inputs.esp-dev.overlays.default
  ];
  packages = [ pkgs.esp-idf-full ];

  enterShell = ''
    echo "$(idf.py --version) | IDF_PATH: $IDF_PATH"
  '';

  scripts.build.exec = ''
    set -e

    BUILD_ONLY=0
    FLASH_ONLY=0
    FLASH_SIZE="4mb"
    MERGE_FLAG=""
    
    while [ "$#" -gt 0 ]; do
      case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
        --build-only)
          BUILD_ONLY=1
          shift
          ;;
        --flash-only)
          FLASH_ONLY=1
          BUILD_ONLY=0
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

    ensure_sdkconfig_line() {
      KEY="$1"
      VALUE="$2"
      TMP_FILE="$(mktemp)"

      awk -v key="$KEY" -v value="$VALUE" '
        BEGIN { replaced = 0 }
        $0 ~ ("^" key "=") || $0 ~ ("^# " key " is not set$") {
          if (!replaced) {
            print key "=" value
            replaced = 1
          }
          next
        }
        { print }
        END {
          if (!replaced) {
            print key "=" value
          }
        }
      ' sdkconfig > "$TMP_FILE"

      mv "$TMP_FILE" sdkconfig
    }

    ensure_sdkconfig_not_set() {
      KEY="$1"
      TMP_FILE="$(mktemp)"

      awk -v key="$KEY" '
        BEGIN { replaced = 0 }
        $0 ~ ("^" key "=") || $0 ~ ("^# " key " is not set$") {
          if (!replaced) {
            print "# " key " is not set"
            replaced = 1
          }
          next
        }
        { print }
        END {
          if (!replaced) {
            print "# " key " is not set"
          }
        }
      ' sdkconfig > "$TMP_FILE"

      mv "$TMP_FILE" sdkconfig
    }

    set_esp32_options() {
      ensure_sdkconfig_line CONFIG_CONSOLE_UART_BAUDRATE ${toString monitorBaudRate}
      ensure_sdkconfig_line CONFIG_CONSOLE_UART_TX_GPIO 1
      ensure_sdkconfig_line CONFIG_CONSOLE_UART_RX_GPIO 3
    }

    set_esp32s3_options() {
      ensure_sdkconfig_line CONFIG_CONSOLE_UART_BAUDRATE ${toString monitorBaudRate}
      ensure_sdkconfig_line CONFIG_CONSOLE_UART_TX_GPIO 43
      ensure_sdkconfig_line CONFIG_CONSOLE_UART_RX_GPIO 44
    }

    set_common_config() {
      ensure_sdkconfig_line CONFIG_MONITOR_BAUD ${toString monitorBaudRate}
      ensure_sdkconfig_line CONFIG_ESPTOOLPY_MONITOR_BAUD ${toString monitorBaudRate}
      ensure_sdkconfig_line CONFIG_ESP_CONSOLE_UART_BAUDRATE ${toString monitorBaudRate}
      ensure_sdkconfig_line CONFIG_ESP_CONSOLE_UART_CUSTOM y
      ensure_sdkconfig_line CONFIG_CONSOLE_UART_CUSTOM y
      ensure_sdkconfig_not_set CONFIG_ESP_SYSTEM_PANIC_PRINT_REBOOT
      ensure_sdkconfig_not_set CONFIG_ESP_SYSTEM_PANIC_GDBSTUB
      ensure_sdkconfig_not_set CONFIG_ESP_SYSTEM_PANIC_SILENT_REBOOT
      ensure_sdkconfig_not_set CONFIG_ESP_SYSTEM_PANIC_NONE
      ensure_sdkconfig_line CONFIG_ESP_SYSTEM_PANIC_PRINT_HALT y
      ensure_sdkconfig_line CONFIG_ESP_SYSTEM_EVENT_TASK_STACK_SIZE 4096
      ensure_sdkconfig_not_set CONFIG_PARTITION_TABLE_SINGLE_APP
      ensure_sdkconfig_line CONFIG_PARTITION_TABLE_CUSTOM y
      ensure_sdkconfig_line CONFIG_LWIP_MAX_SOCKETS 32
      ensure_sdkconfig_line CONFIG_HTTPD_WS_SUPPORT y
      ensure_sdkconfig_line CONFIG_ESP_HTTPS_SERVER_ENABLE y
      ensure_sdkconfig_line CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH y
      ensure_sdkconfig_line CONFIG_ESP_TLS_SERVER_SESSION_TICKETS y
    }

    set_2mb() {
      set_common_config
      ensure_sdkconfig_line CONFIG_ESPTOOLPY_FLASHSIZE '"2MB"'
      ensure_sdkconfig_not_set CONFIG_ESPTOOLPY_FLASHSIZE_4MB
      ensure_sdkconfig_line CONFIG_ESPTOOLPY_FLASHSIZE_2MB y
      ensure_sdkconfig_line CONFIG_PARTITION_TABLE_FILENAME '"partitions-2mb.csv"'
      ensure_sdkconfig_line CONFIG_PARTITION_TABLE_CUSTOM_FILENAME '"partitions-2mb.csv"'
    }

    set_4mb() {
      set_common_config
      ensure_sdkconfig_line CONFIG_ESPTOOLPY_FLASHSIZE '"4MB"'
      ensure_sdkconfig_line CONFIG_ESPTOOLPY_FLASHSIZE_4MB y
      ensure_sdkconfig_not_set CONFIG_ESPTOOLPY_FLASHSIZE_2MB
      ensure_sdkconfig_line CONFIG_PARTITION_TABLE_FILENAME '"partitions-4mb.csv"'
      ensure_sdkconfig_line CONFIG_PARTITION_TABLE_CUSTOM_FILENAME '"partitions-4mb.csv"'
    }

    if [ ! -f sdkconfig ]; then
      idf.py reconfigure
      idf.py set-target ${espBoard}

      set_${espBoard}_options
    fi

    echo "Applying flash size: $FLASH_SIZE"

    if [ "$FLASH_ONLY" -eq 0 ]; then
      if [ "$FLASH_SIZE" = "2mb" ]; then
        set_2mb
      else
        set_4mb
      fi

      (
        cd frontend
        [ -d node_modules ] || npm i
        npx prettier --write .
        vite build
      )

      (
        [ -f cfg/settings.json ] || cp cfg/settings.template.json cfg/settings.json
        cd backend
        clang-format -i *.c *.h
      )

      idf.py build

      if [ -n "$MERGE_FLAG" ]; then
        idf.py merge-bin $MERGE_FLAG
      else
        idf.py merge-bin
      fi
    fi

    if [ "$FLASH_ONLY" -eq 1 ] || [ "$BUILD_ONLY" -eq 0 ]; then
      idf.py -b ${toString programmingBaudRate} flash
      if [ "$FLASH_ONLY" -eq 0 ]; then
        idf.py monitor
      fi
    fi
  '';
  
  languages.c.enable = true;
  languages.python.enable = true;
  languages.javascript = {
    enable = true;
    npm.enable = true;
  };
  devenv.warnOnNewVersion = false;
}
