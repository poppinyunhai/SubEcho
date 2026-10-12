# GitHub 与 Chrome 商店发布

## GitHub

建议仓库名：`subecho`。建议简介：`Give YouTube captions a voice with Xiaomi MiMo TTS.`

项目使用 MIT License。创建自己的 GitHub 仓库后，上传源码、文档和 `.github/workflows/check.yml` 即可。不要上传个人 Key、`.env` 或本地 Chrome 配置。`dist/` 默认忽略；把生成的 ZIP 附到 GitHub Release 即可。

```sh
npm run check
npm test
npm run package
```

ZIP 位于 `dist/subecho-0.3.0.zip`，只包含扩展运行文件及图标，不包含测试、文档、CI 或任何个人配置。CI 会自动运行检查并产出 ZIP。

## Chrome Web Store

代码已按 Manifest V3 打包，所有执行代码随扩展提供，不下载远程脚本。提交前仍需准备开发者账号、公开隐私政策页面、真实使用截图和商店资料，审核通过后才会上架。

1. 注册 Chrome Web Store 开发者账号，按后台要求支付一次性注册费，启用两步验证。
2. 上传生成的 ZIP。
3. 图标使用 `icons/icon128.png`；准备至少一张 1280×800 的真实扩展使用截图和一张 440×280 宣传图。截图不要包含 Key、个人账号或私人视频信息。
4. 在 GitHub Pages 或自己的网站发布 `privacy.html`，填写可公开访问的隐私政策 URL。确认联系入口指向实际仓库 Issues/支持页。
5. 使用下方描述、权限用途和数据说明填写后台。不要勾选「不处理用户数据」：字幕是网站内容，API Key 是认证信息，即便 Key 只保存本地也需要披露。
6. 给审核人员提供使用步骤，说明需要自行提供有效 MiMo Key，或通过审核后台安全提供受限、可撤销的专用测试凭据，不把凭据写入公开说明或安装包。
7. 在更新后的扩展上实测字幕、暂停、跳转、网络失败和限流，然后提交审核。

官方资料：[注册账号](https://developer.chrome.com/docs/webstore/register)、[发布流程](https://developer.chrome.com/docs/webstore/publish)、[商店资料](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)、[图片要求](https://developer.chrome.com/docs/webstore/images)、[数据披露](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)。

## 商店描述草稿

SubEcho · 字幕回声让你用声音听懂当前视频字幕。选择英文字幕与 AI 翻译模式，或选择直接朗读现有字幕后，扩展通过你自己的小米 MiMo API Key 生成语音，并降低原视频音量。

功能：英文字幕 AI 翻译配音、上下文翻译、双语对照、流式字幕朗读、字幕去重、中文音色与语速选择、暂停同步、跳转取消旧配音、网络错误自动重试，以及页面状态提示。

需要自行提供 MiMo API Key，调用会使用你的账号额度。开启配音时，字幕、翻译上下文和请求认证信息直接发送至小米 MiMo。Key 仅保存在扩展本地。没有字幕的视频无法使用；AI 模式由 MiMo 文本模型翻译成中文，直接朗读模式使用现有字幕。网络和语音合成会造成延迟，不保证严格实时同声。

本项目与 YouTube、Google、小米无官方关联。

## 权限说明

- `storage`：保存用户填写的 MiMo Key、配音设置、翻译模式及同意状态。Key 不通过 Chrome Sync 同步。
- `activeTab`：在用户点击插件时识别当前 YouTube 标签页并发送开始/停止指令。
- `https://www.youtube.com/*` 内容脚本范围：读取字幕和视频播放状态，在页面显示配音状态和播放语音。
- `https://api.xiaomimimo.com/*` 主机权限：通过 HTTPS 调用 MiMo 语音合成 API。

## 数据披露填写依据

扩展处理网站内容（字幕）和认证信息（MiMo Key），本地访问视频地址和播放状态用于同步，保存偏好设置。字幕和 Key 直接发送给 MiMo。无作者后端，无分析、广告、数据出售或人工审阅。

后台字段可能更新，应以实际表单为准；声明必须与 `PRIVACY.md` 及实际代码一致。不能把「无作者后端」等同于「没有向第三方发送数据」。

## Git 版本与回退

- `v0.2.1`：增加 AI 翻译前的稳定回退点。
- `feat/ai-translation`：0.3.0 翻译功能分支，保留 `main` 原版本。

保留当前目录，另外检出旧版用于加载：

```sh
git worktree add ../SubEcho-v0.2.1 v0.2.1
```

在 `chrome://extensions` 中停用新版，再「加载已解压的扩展程序」选择旧版目录。回到新版时切换启用状态并刷新视频页面。

只需切换代码版本时，先确保工作区干净，再执行 `git switch --detach v0.2.1`；返回功能分支使用 `git switch feat/ai-translation`。不要使用 `git reset --hard` 回退，以免丢失本地改动。
