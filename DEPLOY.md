# 部署指南

## 部署到 Github Pages

1. 创建 Github 仓库
   - 在 Github 上创建一个新的仓库，命名为 `TBAI`
   - 将本地代码推送到该仓库

2. 初始化 Git 并推送代码
```bash
git init
git add .
git commit -m "初始化项目"
git branch -M main
git remote add origin https://github.com/xionglingsong/TBAI.git
git push -u origin main
```

3. 配置 Github Pages
   - 在仓库设置中找到 Pages 选项
   - 在 Build and deployment 部分：
     - Source 选择 "Github Actions"
     - 选择 "Static HTML" workflow

4. 创建部署工作流
   - 在仓库中创建 `.github/workflows/deploy.yml` 文件
   - 文件内容已预先配置好

5. 构建和部署
   - 推送代码后，Github Actions 会自动运行部署流程
   - 等待部署完成后，可以通过 `https://xionglingsong.github.io/TBAI` 访问应用

## 本地测试

在推送到 Github 之前，可以先在本地测试构建：

```bash
npm run build
npm run preview
```

## 注意事项

1. 确保 `vite.config.js` 中的 `base` 配置与仓库名一致
2. 所有资源路径都应该是相对路径
3. 如果部署后页面显示404，检查仓库名称是否与配置一致