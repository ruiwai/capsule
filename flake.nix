{
  description = "Pi Capsule controller and real NixOS uv/FHS integration fixture";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system: {
        default = nixpkgs.legacyPackages.${system}.mkShell {
          packages = with nixpkgs.legacyPackages.${system}; [ nodejs_22 uv python312 ];
        };
      });
      packages = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system}; in
        if !pkgs.stdenv.hostPlatform.isLinux then { default = pkgs.writeShellScriptBin "capsule-fhs" "echo Linux-only >&2; exit 1"; }
        else rec {
          capsule-fhs = pkgs.buildFHSEnv {
            name = "capsule-fhs";
            targetPkgs = p: with p; [ bash coreutils python312 uv ruff basedpyright ];
            runScript = "bash";
          };
          generic-checker = pkgs.stdenv.mkDerivation {
            name = "capsule-generic-checker";
            dontUnpack = true;
            nativeBuildInputs = [ pkgs.patchelf ];
            buildPhase = ''
              cat > check.c <<'C'
              #include <stdio.h>
              int main(void) { puts("generic-checker 1.0"); return 0; }
              C
              $CC check.c -o checker
              patchelf --set-interpreter /lib64/ld-linux-x86-64.so.2 checker
            '';
            installPhase = "mkdir -p $out/bin; cp checker $out/bin/generic-checker";
          };
          loader-runtime = pkgs.runCommand "capsule-loader-runtime" {} ''
            mkdir -p $out/lib
            ln -s ${pkgs.glibc}/lib/ld-linux-*.so.2 $out/lib/
            ln -s ${pkgs.glibc}/lib/libc.so.6 $out/lib/
          '';
          default = capsule-fhs;
        });
    };
}
