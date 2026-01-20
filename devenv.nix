{ pkgs, inputs, ... }:

let
  programmingBaudRate = 921600;
  monitorBaudRate = 921600;
  defaultSdkConfig = ''
    CONFIG_PARTITION_TABLE_CUSTOM=y
    CONFIG_HTTPD_WS_SUPPORT=y
    CONFIG_MONITOR_BAUD=${toString monitorBaudRate}
    CONFIG_ESPTOOLPY_MONITOR_BAUD=${toString monitorBaudRate}

    CONFIG_ESPTOOLPY_FLASHSIZE="4MB"
    CONFIG_ESPTOOLPY_FLASHSIZE_4MB=y
    # CONFIG_ESPTOOLPY_FLASHSIZE_2MB is not set
    CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="partitions-4mb.csv"
    CONFIG_PARTITION_TABLE_FILENAME="partitions-4mb.csv"
  '';
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

    (
      cd web_app
      [ -f cfg_partition/config.json ] || cp cfg_partition/config.template.json cfg_partition/config.json
      [ -d node_modules ] || npm i
      npx prettier --write .
      vite build
    )

    (
      cd main
      clang-format -i *.c *.h
    )

    SDKCONFIG_CREATED=0

    if [ ! -f sdkconfig ]; then
      echo "Creating sdkconfig with defaults"

      cat > sdkconfig <<EOF
${defaultSdkConfig}
EOF

      SDKCONFIG_CREATED=1
    fi

    if [ -n "$FLASH_SIZE" ]; then
      echo "Applying flash size: $FLASH_SIZE"

      if [ "$FLASH_SIZE" = "2mb" ]; then
        sed -i \
          -e 's/^CONFIG_ESPTOOLPY_FLASHSIZE=.*/CONFIG_ESPTOOLPY_FLASHSIZE="2MB"/' \
          -e 's/^.*CONFIG_ESPTOOLPY_FLASHSIZE_4MB.*/# CONFIG_ESPTOOLPY_FLASHSIZE_4MB is not set/' \
          -e 's/^.*CONFIG_ESPTOOLPY_FLASHSIZE_2MB.*/CONFIG_ESPTOOLPY_FLASHSIZE_2MB=y/' \
          -e 's/partitions-[0-9]*mb.csv/partitions-2mb.csv/g' \
          sdkconfig
      else
        sed -i \
          -e 's/^CONFIG_ESPTOOLPY_FLASHSIZE=.*/CONFIG_ESPTOOLPY_FLASHSIZE="4MB"/' \
          -e 's/^.*CONFIG_ESPTOOLPY_FLASHSIZE_4MB.*/CONFIG_ESPTOOLPY_FLASHSIZE_4MB=y/' \
          -e 's/^.*CONFIG_ESPTOOLPY_FLASHSIZE_2MB.*/# CONFIG_ESPTOOLPY_FLASHSIZE_2MB is not set/' \
          -e 's/partitions-[0-9]*mb.csv/partitions-4mb.csv/g' \
          sdkconfig
      fi
    fi

    if [ "$SDKCONFIG_CREATED" -eq 1 ] || [ -n "$FLASH_SIZE" ]; then
      idf.py reconfigure
    fi

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