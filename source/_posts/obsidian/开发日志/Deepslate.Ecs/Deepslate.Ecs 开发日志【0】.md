---
publish: true
title: Deepslate.Ecs 开发日志【0】
date: 2024-02-01 19:24
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
# Deepslate.Ecs 开发日志【0】

## Deepslate.Ecs 是什么
**Deepslate.Ecs**是一个由 C#编写的 ECS 库。

至于 ECS，全称 Entity Component System，是一种面向数据且缓存友好的编程模式。它的数据 (Component) 往往在内存上尽可能地紧密排布以提高缓存命中率，而逻辑 (System) 部分和数据部分分开，实现行为和数据的解耦。数据只是依附于实体 (Entity) 的一段数据，本身没有意义，由处理数据的逻辑负责为其赋予意义。

具体的可以看这篇文章：  
[SanderMertens/ecs-faq: Frequently asked questions about Entity Component Systems (github.com)](https://github.com/SanderMertens/ecs-faq)

## 动机
我个人非常喜欢玩 Minecraft，以至于想要自己写一个 Minecraft，而使用的语言则是我最熟悉的 C#。

在先前的一个偶然机会，我了解到了一个库*EnTT*，这是一个由 C++ 实现的 ECS 库，也是 Minecraft 基岩版底层采用的 ECS 库。在这之前，我一直以为基岩版相较于 Java 版出色的性能表现完全来源于 C++ 本身的运行效率，而了解到*EnTT*的性能表现后，我才意识到 ECS 能给游戏带来多大的提升。

> 以我个人的经验而言，同等性能表现下，基岩版能开相较于 Java 版几乎 2 倍的视距，这意味着 8 倍的地图加载大小。
> 
> 在 Java 版中玩家高速移动的情况下常常使得周围的区块来不及加载，经常只能看 2 个区块的范围，而基岩版中很少会出现这种情况。

见识到了 ECS 的魔力，我自然想把它用在我自己的 Minecraft 中。目前我能找到的比较成熟的且支持 C#的 ECS 开源库就 3 个：
- [flecs](https://github.com/SanderMertens/flecs) 纯 C 实现，有自动生成的 C# binding 可以使用
- [Entitas](https://github.com/sschmid/Entitas) 纯 C#实现，十分轻量，核心代码不到 3k 行，可以独立使用，但主要为 Unity 设计，算是 Unity dots 出现前的替代物
- [Svelto.ECS](https://github.com/sebas77/Svelto.ECS) 纯 C#实现，可以独立使用，但主要为 Unity 设计，是 Unity dots 的补充

Entitas 在 dots 出现后停止维护了很长一段时间，后来恢复，但是经过一小段时间更新后又停止了维护。

而 flecs 和 Svelto.ECS 都相当活跃，flecs 也是我原本打算使用的 ECS 库，但是在我了解到 Svelto.ECS 后，我就萌生了自己实现 ECS 的想法，主要的原因是 Svelto.ECS 的 README 中的一段话给了我灵感，  
Svelto.ECS 中的 Archetype 是不可变的。
> Svelto.ECS 中没有叫 Archetype 的类型，但是有概念上类似的。

{% note  'fa-solid fa-quote-right' simple %}
**Svelto.ECS** is loosely based on the **Archetype** idea. <u>*The main difference compared to any other Archetype-based model is that Svelto Archetypes are static, meaning that users cannot add or remove components at runtime.*</u> There are many design reasons behind this decision, including the fact that users are often not aware of the costs of structural changes.
{% endnote %}

我并没有去细看 Svelto.ECS 的实现，但是这一句话点醒了我。

以传统的 Unity 开发举例，试想一下，在实际的游戏开发中很少会在运行时去动态地增删 Component（指 Unity 的 `MonoBehaviour`)，哪怕真的需要会这么做，往往也能事先确定增删的 Component 类型。

在大多数情况下，创建一个 GameObject 会直接使用预制体或某个已经事先创建好的原型对象完成，增删 Component 也大都只是对通过前面这种方式创建的对象做一些小修小改，而非从一个光秃秃的 GameObject 开始组装出一个完整对象。理论上，完全可以将这种仅增减少数几个 Component 的情况全部制成预制体的变体，来消除代码上的增减操作。

当然，Archetype 和预制体是不一样的，前者只是 Component（指 ECS 的 Component）的组合，后者是 Component（Unity）、对象、层级以及数据的结合，是更高一层的封装。但思想是相通的，它们都是运行时的一类相似事物的原型。

因此，让 Archetype 不可变是完全可行的，Svelto.ECS 的这种限制也为它带来了不小的性能增幅，以至于在已经有 dots 的情况下，还能在 Unity 的 ECS 库中占有一席之地。

> Svelto.ECS 本身并不与 dots 冲突，相反的，它们非常的互补，Svelto.ECS 可以利用 dots 获取进一步的性能提升。

既然如此，为什么我不直接使用 Svelto.ECS 呢？

首先，因为 Svelto.ECS 为了在 Unity 下使用，它用的是.netstantard2.0 标准，可以使用的 C#特性很少，开发体验不好，而且我准备先从服务端写起，这将是一个命令行程序，不需要 Unity 的加入，那么我自然是希望能够使用最新的 dotnet8 和 C# 12 的。

其次，Svelto.ECS 为了既和 Unity 兼容，又可独立使用，它的 API 设计并不直观，而且缺乏文档，虽然项目介绍中说有着详尽的注释，但其实注释内容一般。

于是，在以上重重因素之下，我决定自己实现一个 ECS 库，其名字来源于我的 Minecraft 服务器项目 Deepslate。

> Deepslate 是 Minecraft 中的一种方块，中文译名为“深板岩”。  
> ![Deepslate_JE2.png](https://zh.minecraft.wiki/images/Deepslate_JE2.png?2ce1c&format=original)