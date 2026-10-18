# Schema 静态发布

## 发布资源

核心和官方扩展均为 JSON Schema 2020-12。目标站点根路径为 https://mapseekai.github.io/raster-style/，URL 是精确版本标识，不用于推导扩展字段名称。

| 本地源文件                                  | 发布路径                                                  |
| ------------------------------------------- | --------------------------------------------------------- |
| spec/v3/raster-style-v3.schema.json         | /raster-style/spec/v3/raster-style-v3.schema.json         |
| extensions/raster/mosaic/v1.0.0/schema.json | /raster-style/extensions/raster/mosaic/v1.0.0/schema.json |
| extensions/raster/tile/v1.0.0/schema.json   | /raster-style/extensions/raster/tile/v1.0.0/schema.json   |

每个文件的 `$id` 与目标绝对 URL 完全一致。官方资源同时嵌入 SDK，站点是否上线不影响本地校验。

## 本地构建与检查

```sh
pnpm build:site
```

scripts/build-site.mjs 从规范来源生成 .build/site，检查 Schema 草案、URL 与部署路径一致、版本目录和重复身份，保留所有源目录中的扩展版本。输出入口 index.html、禁用 Jekyll 的 .nojekyll、原始 Schema 文件以及包含 SHA-256 的 schemas.json。默认构建完全离线；输出文件逐个校验与源文件字节一致。

显式核对远程版本内容：

```sh
pnpm check:published
```

此命令执行受控 HTTP 请求。已发布的 Schema 必须与源文件 SHA-256 相同；已有版本不能从远程索引中消失。HTTP 404 表示该目标尚未取得发布资源，不等于已成功上线。其他网络或状态错误中止检查；不会把无法验证当作通过。

## GitHub Pages 工作流

.github/workflows/pages.yml 在 main 分支的推送通过 CI 后构建并部署对应提交，也可在 main 上手动触发。构建工作仅需 contents:read；部署工作使用 pages:write、id-token:write 和 github-pages 环境。PR 和外部仓库的工作流结果不会触发部署。

仓库 Settings → Pages 的 Build and deployment → Source 需要设为 GitHub Actions，并按组织要求配置 github-pages 环境保护。随后推送代码并等待 CI 与 Publish schemas 成功，或手动触发已审核提交的发布工作流。工作流中的网络校验防止已发布的版本内容被静默覆盖。

发布后逐项验证三个目标 URL 的 HTTP 状态、JSON `$id` 和与本地产物一致的 SHA-256；再验证 schemas.json 索引。工作流成功记录和实际 URL 响应共同作为发布证据，仅生成本地产物不构成上线。

## 版本稳定性

发布后的版本目录及 Schema 内容保持稳定。变更业务规则或校验时新增版本地址，SDK 升级内置版本；不能用 latest 作为版本身份，不能覆盖旧 URL 的含义。新发布产物保留已上线的版本资源。

核心协议、Q3 绑定、SDK 包与每个扩展的版本分别管理。SDK 包发布与 Pages 发布是独立动作；修改 package.json 或 Cargo.toml 的版本号不会自动发布到 npm、crates.io 或创建 Go tag。

## SDK 发布渠道

SDK 0.4.0 对应核心协议 3.0 与 Q3 绑定，三个语言包使用一致的 SDK 版本：

| SDK        | 发布渠道    | 版本标识                                               |
| ---------- | ----------- | ------------------------------------------------------ |
| TypeScript | npm         | `@mapseek/raster-style@0.4.0`                          |
| Go         | Go 模块代理 | `github.com/mapseekai/raster-style/packages/go@v0.4.0` |
| Rust       | crates.io   | `raster-style@0.4.0`                                   |

先运行 `pnpm test:all` 并在工作区之外验收安装包，提交并推送发布源码，等待 CI 成功。项目标签 `v0.4.0` 与 Go 子模块标签 `packages/go/v0.4.0` 指向同一提交。随后发布 npm 和 crates.io 包，通过各渠道下载精确版本，核对完整性并运行独立消费者，再创建 GitHub Release。

Schema 站点随 `main` 的 CI 成功结果构建和部署。发布验收同时记录 CI、Pages、部署提交 SHA，以及首页、索引和各 Schema 与本地产物一致的内容哈希。

参考：[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 响应读取与打包验收

远程资源核查按实际解码字节执行 2 MiB 流式预算，首次超限取消读取。Rust 包验收通过 scripts/check_package.py 在工作区之外解包并运行全部测试，测试向量与共享来源逐项比对。两项检查已纳入 pnpm test:all。
