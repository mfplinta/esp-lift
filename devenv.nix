{ pkgs, inputs, ... }:

{
  overlays = [ inputs.esp-dev.overlays.default ];
  packages = [ pkgs.esp-idf-full ];

  enterShell = ''
    echo "$(idf.py --version) | IDF_PATH: $IDF_PATH"
  '';

  scripts.build.exec = ''
    (
      cd web_app
      (
        cd cfg_partition
        [ -f config.json ] || cp config.template.json config.json
      )
      [ -d node_modules ] || npm i
      npx prettier --write .
      vite build
    )
    (
      cd main
      clang-format -i *.c *.h
    )
    idf.py -b 921600 build flash monitor
  '';

  languages.c.enable = true;
  languages.python = {
    enable = true;
  };

  languages.javascript = {
    enable = true;
    npm.enable = true;
  };
}
