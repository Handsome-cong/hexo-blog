---
publish: true
title: Deepslate.Ecs 开发日志【2】：Api
date: 2024-02-04 22:20
tags:
categories: blog
series: 
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
# Deepslate.Ecs 开发日志【2】

## Api 设计风格

虽说这个项目最初的动机是另一个我的私人项目，但是我还是想要将 Deepslate.Ecs 做得尽可能通用和易用。那么，一套简洁明了的 Api 设计风格就很必要了。

规范的命名有助于理解 Api 的功能，项目中有如下几种 Api 命名的约定：

- `With` 开头的方法意味着添加或覆盖某个对象，参数相同或部分相同的情况下多次调用会覆盖先前的操作
- `Add` 开头的方法意味着添加某个对象，即使参数相同的情况下多次调用，也不会有覆盖产生

项目中大量采用了 Builder 的形式来配置和创建对象，这有助于复杂对象的创建和提供默认配置，目前设计的 Builder 类型包括：

- `WorldBuilder` 用于创建 `World` ，还可以注册 `IComponent`
- `ArchetypeBuilder` 用于创建 `Archetype` ，由 `WorldBuilder` 创建
- `StageBuilder` 用于创建 `Stage`，由 `WorldBuilder` 创建
- `TickSystemBuilder` 用于创建 `TickSystem` ，由 `StageBuilder` 创建
- `QueryBuilder` 用于创建 `Query` ，由 `TickSystemBuilder` 创建

除了 `WorldBuilder` ，所有的 Builder 都由所属的上级 Builder 创建。所有的 Builder 都具有一个 `Build()` 方法，只有调用 `Build()` 后，Builder 中配置的内容才会生效，并且后续的配置将会变成无用操作，若想创建多个实例，就创建多个 Builder。

Builder 中可能存在一些必须提供的参数，对于这些参数，我将其全部放入了 `Build()` 方法的参数表。而可选的参数则都可以用链式调用的 Api 进行指定。

## 设计上的取舍

Deepslate.Ecs 中的 System 需要被称为 `TickSystem` ，这不是用户直接能 `new` 出来的类型，用户的 System 逻辑代码被称为 `TickSystemExecutor` ，用户需要将实现了这些逻辑的 System 加上一个 `ITickSystemExecutor` 接口，这个接口的定义如下：

```csharp

public interface ITickSystemExecutor
{
    void Execute();
}
```

这个接口很简洁，就一个方法，也很理想，一个 System 本就应该只要一个执行的入口就够了。

它的注册过程则是类似这样：

```csharp
systemBuilder
    .AddQuery()
    ... // Query 创建逻辑
    .Build(new MySystemExecutor());
```

考虑到 System 本身的逻辑和它所需的 Query 是高度绑定的，因此可以直接将 `SystemBuilder` 作为构造函数的参数传入用户自己的 System 进行构造：

```csharp
class MySystemExecutor : ISystemExecutor
{
    private Query _query;
    public MySystemExecutor(SystemBuilder builder)
    {
        builder.AddQuery()
            ... // Query 配置操作
            .Build(out _query);
    }
}
```

但是，从使用的角度来说，这可能不是很方便，尤其是当用户的 System 需要事先创建的时候。事实上在这之前，System 的接口设计并非如此，而是像这样：

```csharp
public interface ISystem
{
    void Initialize(SystemConfigurator configurator);
    void Execute();
}
```

可以看到，除了用于表示 System 的接口的名字变了外，还多了个 `Initialize` 方法用于初始化。这是因为原本我心目中的 System 创建方式是这样的：

```csharp
public sealed class MySystem : ISystem
{
    private Query _myQuery;

    public void Initialize(SystemConfigurator configurator)
    {
        _myQuery = configurator.AddQuery()
            .RequireReadOnlyComponent<MyComponent>()
            .Build();
    }

    public void Execute()
    {
        // 通过_myQuery访问Component
    }
}
```

原本我的想法中，System 会在一开始的时候调用 `Initialize` 方法，然后每帧调用 `Execute` 。System 的配置和其逻辑需求高度绑定，因此将完成配置的初始化工作放在一个它自己的 `Initialize` 方法中显然是合情合理的。并且，原本的 System 注册 Api 使用起来长这样：

```csharp
var mySystem = new MySystem();
stageBuilder.addSystem(mySystem);
```