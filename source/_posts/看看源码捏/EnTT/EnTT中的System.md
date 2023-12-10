---
publish: true
title: EnTT源码解读【3】：EnTT中的"System"
date: 2023-12-06 15:18
tags: EnTT
categories: 源码解读
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
# EnTT 中的 "System"
## System 是什么
**System** 是 ECS 的三个核心成员之一，它*包含了 ECS 的逻辑部分，用于处理 Component 的数据*。

一般来说，与 Component 相对的，System 仅包含逻辑，不包含数据（状态）。

## EnTT 中的 "System"
EnTT 中没有为 System 指定一个公共的基类，甚至没有像 Component 那样存在一个 component_traits 模板作限制。EnTT 中的 System 就是普通的函数、仿函数或 lambda，不需要事先声明，也没有什么要求。

也不存在一个 "system.hpp" 文件来对其进行描述。

> "entity.hpp" 和 "component.hpp" 是存在的，见前两篇文章。

## EnTT 的 "System" 是如何运作的
**TODO**:
- [ ] 如何识别传入 "System" 的所需参数
- [ ] 如何访问 Entity 和 Component