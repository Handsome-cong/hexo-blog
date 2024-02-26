---
publish: true
title: Deepslate.Ecs 开发日志【3】：结构
date: 2024-02-13 23:11
tags:
categories: blog
series: Deepslate.Ecs 开发日志
keywords:
description:
top_img: 
comments:
cover: https://zh.minecraft.wiki/images/Deepslate_JE2.png?2ce1c&format=original
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
# Deepslate.Ecs 开发日志【3】

## 结构

我设想中的 ECS 实现由以下几个部分构成：

- World
- Component
- Archetype
- Stage
- TickSystem
- Query
- Scheduler

## World

**World** 包含了 ECS 所需的所有内容，它的构成有：

- 所有的 Component 注册信息
	- Component 类型信息
	- Component 的存储方式
	- 供内部使用的 ID
- 所有的 Archetype
	- 包含的 Component 的类型信息
	- 用于存储 Component 的 Component Storage
- Scheduler
	- 所有的 Stage
	- 当前的执行状态
	- 记录的 DeferredCommand

Scheduler 对用户并不可见，它只是为了分离调度逻辑而被单独设计的一个类型，每个 World 也只有一个 Scheduler。

![Deepslate.Ecs 开发日志【3】 world_structure.svg](Deepslate.Ecs 开发日志【3】 world_structure.svg)  
绿线代表唯一。

## Stage
**Stage** 包含了多个 TickSystem，主要用于辅助 Scheduler 工作，它的构成有：
 - TickSystem，一个 Stage 可以包含多个 TickSystem
 - DependencyGraph，一个预生成的依赖图，用于描述 TickSystem 间的依赖和冲突关系

![Deepslate.Ecs 开发日志【3】 stage_structure.svg](Deepslate.Ecs 开发日志【3】 stage_structure.svg)  
绿线代表唯一。

## TickSystem
**TickSystem** 包含了用户定义的需要每帧执行的业务逻辑，它的构成有：

- Executor，这是包含了用户定义的逻辑的对象，每个 TickSystem 有且仅有一个
- Query，TickSystem 在执行时需要访问的内容的*表述*，可以包含多个，用于告诉 Scheduler 这个 TickSystem 可能会访问什么数据，以实现自动并行执行

![Deepslate.Ecs 开发日志【3】 system_structure.svg](Deepslate.Ecs 开发日志【3】 system_structure.svg)  
绿线代表唯一，虚线代表仅引用，无所有权。

## Query 
**Query** 描述了一个 TickSystem 的需求信息，它的构成有：
- MatchedArchetypes，与这个 Query 相符的所有 Archetype
- RequireInstantCommand，一个 bool，用于决定 TickSystem 对这个 Query 匹配的 Archetype 是否有权力进行即时的 Structural Change 操作
- 配置的需求信息

Query 除了表述需求信息，还供 TickSystem 在执行时获取相应的 Component 和 Entity。

![Deepslate.Ecs 开发日志【3】 query_structure.svg](Deepslate.Ecs 开发日志【3】 query_structure.svg)