---
publish: true
title: Hexo+Obsidian工作流的构建过程
date: 2023-11-20 15:46
updated: 星期一 20日 十一月 2023 15:46:57
tags: 
categories: 
keywords: 
description: 
top_img: https://www.handsome-cong.fun/api/random-image-blob
comments: 
cover: https://www.handsome-cong.fun/api/random-image-blob
toc: 
toc_number: 
toc_style_simple: 
copyright: 
copyright_author: 
copyright_author_href: 
copyright_url: 
copyright_info: 
mathjax: 
katex: 
aplayer: 
highlight_shrink: 
aside: 
abcjs:
---
# Hexo+Obsidian工作流的构建过程
<img align="right" alt="Glowstone logo" width="100" src="https://hexo.io/logo.svg">

## Hexo是什么
[Hexo](https://hexo.io/)是一个快速、简洁且高效的博客框架。它由Node.js构建，可以通过markdown、EJS、Pug等等的文档文件生成html，并用于构建静态网站。

Hexo的各种文档类型的支持来源于其插件系统，文档到html的转换的功能由插件提供。

> 官方说它很快，几秒就能完成build，但是相比另一个框架[Hugo](https://gohugo.io/)，它就显得很慢了。而且并不能如官方所说，让上百个页面在几秒内渲染完毕。

## 为什么选择Hexo
- 相比动态博客框架，如[typecho](https://typecho.org/)
	- Hexo极致的轻量 
	- 静态网页极致的安全 
	- 可以直接将网页部署在[GitHub Pages](https://pages.github.com/)上，而不用搭建自己的服务器。
	- 也意味着上限更低，整不了花活
- 相比Hugo，
	- 教程更多
	- 插件生态更好
	- 速度更慢

> 我只是想写个博客，不整花活，构建也是通过[GitHub Actions](https://docs.github.com/zh/actions)进行，慢一点无所谓。

## 搭建过程
### 搭建Hexo和安装Obsidian
Hexo: [官方文档](https://hexo.io/zh-cn/docs/)  
Obsidian: [官网](https://obsidian.md/)

照着文档将Hexo托管至Github，并且能通过Git Pages打开即可。
### 将Obsidian的vault托管至Github
1. 用obsidian新建一个vault（obsidian的仓库）。
2. 在GitHub上创建仓库并Clone到本地。
3. 将vault内容复制至刚刚Clone下来的git仓库内。
4. 在git仓库内打开obsidian
5. 安装obsidian插件[Obsidian Git](https://github.com/denolehov/obsidian-git)。
	![image.png](https://picgo.handsome-cong.fun/Gallery/hexo/images/20231120163739.png)
6. 对插件进行配置。
	![image.png](https://picgo.handsome-cong.fun/Gallery/hexo/images/20231120164041.png)
7. 提交git。

到此为止，已经实现用Github托管Obsidian笔记。

### 让Obsidian笔记仓库和Hexo仓库实现联动
1. 在obsidian笔记的仓库下创建GitHub Actions文件  
	你的仓库路径"/.github/workflows/xxx.yml"  
	文件名无所谓，复制以下内容进文件：
	```yaml
	name: Merge

	on:
	push:
		branches:
		- master

	env:
	NOTE_DIR: ${{ github.workspace }}/note_repo/
	BLOG_DIR: ${{ github.workspace }}/blog_repo/

	jobs:
	merge:
		runs-on: ubuntu-latest
		steps:
		- name: Checkout note source
			uses: actions/checkout@v3
			with:
			path: ${{ env.NOTE_DIR }}
		- name: Checkout blog source
			uses: actions/checkout@v3
			with:
			path: ${{ env.BLOG_DIR }}
			repository: Handsome-cong/handsome-cong.github.io
			token: ${{ secrets.BLOG_TOKEN }}
		- name: Remove old files
			run: rm -rf $BLOG_DIR/source/_posts/*
		- name: Copy note to blog
			run: cp -r $NOTE_DIR/Hexo/* $BLOG_DIR/source/_posts/
		- name: Commit changes
			env:
			ACCESS_TOKEN: ${{ secrets.BLOG_TOKEN }}
			run: |
			cd $BLOG_DIR
			git config --global user.email "你的邮箱"
			git config --global user.name "你的名字"
			git add -A
			git commit -m "Auto merge blog"
			git push
	```
	这里所有的`name`标签后的内容都无所谓，随便修改。  
	*需要改动的是：`git config --global user.email`后的邮箱和`git config --global user.name`后的名字。*
2. 为了能让Github Actions向另一个仓库推送修改，需要为其指定能访问该仓库的Token。
	1. 点击Github头像->Settings->Developer settings->Personal access tokens选择一个token类型，二者皆可。
	2. 将生成的token保存起来。
	3. 转到存储obsidian笔记的Gibhub仓库页面，点击Settings->Secrets and variables->Actions，添加一个secret，secret名为`BLOG_TOKEN`（与上述yaml文件内容相匹配即可），值为刚刚保存的token。
	4. 将本地的obsidian仓库改动推送到GitHub，如无意外，已经可以在Actions页面看到有操作正在执行。执行完后hexo仓库的Action也会被激活，自动执行构建和发布工作。稍等片刻就能看到obsidian的笔记作为博客发布到GitHub Page上了。

至此，已实现obsidian笔记->Hexo博客的自动发布。

### 附件的资源管理
由于Obsidian和Hexo有着不同的资源文件管理方式：
- obsidian可以选择将附件统一存放在一个固定的文件夹，或笔记同目录下，或同目录下的一个固定名称的文件夹内，且修改默认附件文件夹并不影响现有的笔记链接。
- Hexo只能选择让附件存储在某个固定的目录下，或者文章同目录下与文章同名的一个文件夹内。 

Hexo的后者明显与obsidian的每一条规则都不兼容，使用极其不便，而前者可能会因为路径不匹配而导致不能正确链接。

因此可以考虑用图床来存储图片资源，Obsidian有针对[PicGo](https://picgo.github.io/PicGo-Doc/)的[插件](https://github.com/renmu123/obsidian-image-auto-upload-plugin)，可以很方便地搭建和使用自己的图床。

## 注意事项
Obsidian有自己的wiki链接语法，且这些语法无法被Hexo正确解析，因此在需要发布到博客的笔记中，应该尽量使用原生的markdown语法。

上述yaml文件假定了obsidian仓库下Hexo目录内的内容才是要发布至博客的文章，且*每次操作会将原本Hexo仓库下source/\_posts目录的内容删除*来保证笔记和博客的一致性。可以自行修改"**Remove old files**"和"**Copy note to blog**"这两步的操作来满足自己的需求。