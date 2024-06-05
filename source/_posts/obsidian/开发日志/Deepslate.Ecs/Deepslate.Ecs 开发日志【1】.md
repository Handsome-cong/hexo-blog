---
publish: true
title: Deepslate.Ecs 开发日志【1】
date: 2024-02-02 21:24
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
# Deepslate.Ecs 开发日志【1】

这里的是最初的设想，与后期的实际实现并不一定相符

## ECS 之 E、C 以及 S

既然 Deepslate.Ecs 是一个 ECS 库，那么自然少不了 ECS 中的几个基本概念：

- 实体 (Entity)
- 组件 (Component)
- 系统 (System)

### Entity

Entity 代表着任何可能的事物，它是将 Component 组合起来的纽带。

Entity 本身不包含数据，更没有行为，仅仅只是个组织 Component 的媒介，因此它需要足够轻量，最好仅仅是一个整数，或者说一个 ID。

然而，哪怕是一个 4 字节的 int 也远远超出一般应用所需的 Entity 总数，而 Entity 本身占用的内存大小和 Component 相比可以说是九牛一毛，换成 2 字节的 short 显得没有必要，而且 short 的取值范围可能就不够用了。既然如此，不妨逆向思维，让 Entity 的 ID 包含更多的含义来充分使用它的空间。

### Component

Component 代表着数据，它赋予了 Entity 特征。

若以一个比较学术，或比较纯粹的思想去构思的话，Component 应该是纯数据，库或者框架不应对其有什么限制，因为数据本身是纯粹的，没有限制的必要。

{% note green 'fa-solid fa-fire-flame-curved' simple %}
“限制数据”，就比如强行要求 Component 有个 `Name` 属性等等。
{% endnote %}

但是，库是拿来用的，为了更好的开发体验，我还是决定用一个空的 `IComponent` 作为 Component 的标记。而且，虽说为了 cache 友好，Component 肯定是值类型更加适合，但是引用类型也同样支持。

至于行为，即 Component 是否包含逻辑，这是用户的问题，库不做限制，也没有做限制的意义。毕竟想怎么用是用户的事情。

### System

System 代表着行为，它赋予了具有某一类特征的 Entity 意义。

同样的，以一个纯粹的思想去思考，System 应该仅仅表示行为，它甚至可以不是一个具体的类型，而只是一个方法，它除了输入的参数外，也不需要什么限制。

但是，同样的，为了更好的开发体验，我准备引入一个 `ISystem` 接口用来表示 System，这个接口包含两个方法，定义如下：

```csharp
public interface ISystem
{
    void Initialize(SystemConfigurator configurator);
    void Execute();
}
```

其中 `Initialize` 用于 System 的初始化，毕竟 C＃的语言表达能力远不如 C++ 这种语言，C++ 可以通过模板在编译时提取出函数的参数要求，并计算依赖，填入正确类型和数量的参数，C＃不行，因此需要一个额外的手段获取到 System 的依赖信息。

`SystemConfigurator` 只是一个辅助初始化和存储初始化数据的类型。

`Execute` 方法则是 System 的主体，也就是逻辑部分，用于处理 Component 的数据。

## Archetype

Archetype 用于描述某种特定的 Component 组合。

首先需要说明的是，Archetype 并非是 ECS 的一部分，只是有众多 ECS 库使用 Archetype 或类似的概念来进行开发，比如：

- Unity dots
- flecs
- Svelto.ECS

当然的，也存在不使用 Archetype 的 ECS 库，比如 EnTT。

在头一篇文章中有提到，Deepslate.Ecs 很大程度上受到了 Svelto.ECS 中的一句话的启发，因此 Deepslate.Ecs 中的 Archetype 在运行时也是不可变的，需要事先确定。

在基于 Archetype 设计的 ECS 中，Entity 往往必须要属于某个 Archetype，那么直接将 Entity 及其 Component 存于 Archetype 就显得合情合理了。

又由于 Entity 必须要属于 Archetype，且 Deepslate.Ecs 中的 Archetype 需要事先确定并且不能修改，那么不妨设计成 Entity 必须从 Archetype 创建。

那么最后，Deepslate.Ecs 的 Archetype 将包含如下内容：

- 类型数据，用于描述 Archetype 所代表的 Component 组合
- Entity 数据，存储属于该 Archetype 的 Entity
- Component 数据，存储依附于 Entity 的 Component，长度与 Entity 数据相同，种类数量与类型数据数量相同

## Stage

这是一个收到 bevy 的启发而产生的概念，它代表了多个 System 的执行阶段，System 在 Stage 中执行，且可以并行运行，而下一个 Stage 开始前则会保证前一个 Stage 执行结束。具体内容在以后的日志中补充。

## World

World 是将各个部分联系在一起的媒介，它包含了 Component、System、Archetype 以及 Stage 的注册信息，一般一个应用中只会创建一个 World。具体内容在以后的日志中补充。

> bevy 是一个由 rust 编写的游戏引擎，这里指它的 ECS 模块。