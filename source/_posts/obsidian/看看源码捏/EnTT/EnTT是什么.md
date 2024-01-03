---
publish: true
title: EnTT源码解读【0】：EnTT是什么
date: 2023-12-05 16:12
tags: EnTT
categories: blog
series: EnTT源码解读
keywords:
description:
top_img: https://user-images.githubusercontent.com/1812216/103550016-90752280-4ea8-11eb-8667-12ed2219e137.png
comments:
cover: https://user-images.githubusercontent.com/1812216/103550016-90752280-4ea8-11eb-8667-12ed2219e137.png
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
# EnTT 是什么
**EnTT**是一个仅头文件、小巧、易于使用、由现代 C++ 编写的 ECS 库。

使用这个库的最具代表性的项目便是 [**Minecraft**](https://minecraft.net/en-us/attribution/)。

GitHub 地址: https://github.com/skypjack/entt

## TOC
{% series %}

## 关于这个系列
EnTT 的功能众多，并不只是一个单纯的 ECS 库，它还包含了很多其它部分，比如内置的 RTTI 支持等等，这个系列仅介绍它的核心功能，既 ECS。

编写时的版本为 3.12.2