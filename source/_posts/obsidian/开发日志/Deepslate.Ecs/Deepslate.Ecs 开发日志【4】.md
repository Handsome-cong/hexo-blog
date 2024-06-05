---
publish: true
title: Deepslate.Ecs 开发日志【4】：调度器
date: 2024-02-26 17:41
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
# Deepslate.Ecs 开发日志【4】
## 简介
**调度器**(`Scheduler`) 是 Deepslate.Ecs 中的核心部分之一，主要负责调度与执行用户提供的逻辑。

它负责调度的内容包括：
- TickSystem，每一帧执行
- DeferredCommand，延迟执行 Entity 的删除和创建

对 TickSystem 的调度是调度器的核心功能，DeferredCommand 主要起到辅助作用。
## 如何调度

### 依赖关系
在 Deepslate.Ecs 中，用户在创建 TickSystem 的时候需要指定 Query 以访问 Entity 和 Component，能访问到什么 Entity 和 Component 取决于 Query 创建时的参数。另外的，还可以指定 TickSystem 是否需要依赖另一个或多个 TickSystem 的执行，以此来决定 TickSystem 之间的依赖关系。

上述二者最后就构成了一个 TickSystem 的依赖，其中包括：
- TickSystem 需要访问的 Archetype
	- TickSystem 需要访问且可写的 Component
	- TickSystem 需要访问且可读的 Component
- TickSystem 依赖的其它 TickSystem

### 冲突判断
为了构建依赖图，需要判断两个 TickSystem 是否“冲突”。

两个 TickSystem “冲突”的判断过程：
1. 需要访问的 Archetype 是否有重叠，若否则不“冲突”
2. 重叠的 Archetype 中是否存在某个 Component 对于一方可写，而一方可读，是则“冲突”

特别的，具有直接依赖关系的 TickSystem 会被排除冲突计算，这是因为依赖关系是用户直接指定的，在构建依赖图时直接使用即可，而冲突计算是发生在 World 构建的时候，是需要通过计算得到的，用户仅指定了 TickSystem 需要的 Query，并不用指定 Query 之间的冲突。

#### SIMD 优化
考虑到实际使用的时候可能一个 TickSystem 会涉及多个 Component，以及几十个 Archetype，因此需要一种高效的办法来计算依赖关系。

为了实现优化，我将 Query 的依赖信息以二进制的形式表示，分为三段：
1. Query 涉及的 Archetype
2. Query 可写的 Component
3. Query 可读的 Component

每一段的长度为 256 整数倍的二进制位，这是为了利用 AVX256 来做加速。

为了实现编码，每个 Archetype 和 Component 类型都会在创建或注册的时候被分配一个唯一的 ID，这个 ID 在这里会作为偏移量使用。

例如，一段描述涉及 ID 为 1 和 3 的 Archetype 的二进制表示如下：  
![Deepslate.Ecs 开发日志【4】 usagecode_archetype_define.svg](Deepslate.Ecs 开发日志【4】 usagecode_archetype_define.svg)

类似的，一段描述涉及 ID 为 1 和 3 的可读（或可写）Component 的二进制表示如下：  
![Deepslate.Ecs 开发日志【4】 usagecode_query_define.svg](Deepslate.Ecs 开发日志【4】 usagecode_query_define.svg)

将一段 Archetype 描述，两段 Component 描述组合起来，就是一整段依赖关系的二进制表达了。

一个可能的情况：  
![Deepslate.Ecs 开发日志【4】 usagecode_example.svg](Deepslate.Ecs 开发日志【4】 usagecode_example.svg)

最后，将多个 Query 的二进制数据合并，就获得了一个 TickSystem 的二进制依赖信息。

这样，就可以将冲突判断的操作转换为二进制与操作，此时就可以用 `Vector256.BitwiseAnd` 来加速，接着通过 `Vector256.EqualsAll` 判断上一步得到的结果是否全是 0。

### 依赖图构建
依赖图的构建过程很简单，就是遍历各个 TickSystem 然后创建对应的依赖节点，依赖节点包括三部分：
- 这个 TickSystem 依赖的其它 TickSystem
- 依赖这个 TickSystem 的其它 TickSystem
- 与这个 TickSystem 冲突的其它 TickSystem

### 调度策略
调度器会尽可能地并行执行 TickSystem。

调度器内部维护了一个当前 Component 的访问状态以及各个 TickSystem 所依赖的其它 TickSystem 的完成数量。

Component 访问状态包括了：
- 某个 Archetype 的某个 Component 当前是否写入中
- 某个 Archetype 的某个 Component 当前读取中的 TickSystem 数量

当一个 TickSystem 被调度时，它所涉及的可写 Component 会被标记，只读 Component 计数会 +1。

当一个 TickSystem 执行完毕时，它涉及的可写 Component 标记被清楚，只读 Component 计数 -1，依赖它的 TickSystem 的依赖计数 -1，然后遍历与它冲突或依赖它的其它 TickSystem 并尝试调度。

当一个 TickSystem 被尝试调度时，首先判断它依赖的其它 TickSystem 是否以及全部执行完毕，这里仅需判断依赖计数是否为 0，然后判断它的依赖是否与当前正在执行的 TickSystem 冲突，这里可以复用前面提到的 SIMD 优化逻辑来加速判断。

在一个 Stage 开始时，调度器会遍历所有没有依赖的 TickSystem，并逐个尝试调度。

假设现在 World 中存在如下设置：
- 3 个 Archetype
	1. Position
	2. Velocity
	3. (Position, Velocity)
- 一个包含 3 个 TickSystem 的 Stage，它们分别仅包含 1 个 Query
	- Position 只读
	- Velocity 可写
	- Position 只读，Velocity 只读

上述例子在调度时，第一个和第二个 TickSystem 会在刚开始就被并行执行，第三个则需要等到第二个执行完毕，但不需要等第一个，因为它们对 Position 都是只读。

### Stage
这是一个辅助概念，启发自 bevy，它包含了一系列的 TickSystem，调度器进行调度时，总是在一个 Stage 中进行，当一个 Stage 执行完毕后，才会开始执行下一个 Stage。

Stage 不仅仅只是用来“粗暴”地隔离 TickSystem 的执行阶段，它还被用于确定 DeferredCommand 的执行时机。

由于创建和销毁 Entity 会导致 Structural changes，进而使得当前正在遍历相关 Component 的迭代器失效，因此创建和销毁操作的执行权限是需要在 Query 中单独指定的，可以立即执行的创建和销毁操作在 Deepslate.Ecs 中被称为 InstantCommand 顾名思义，立即执行的指令。同时，当一个 Query 需求了 InstantCommand 后，视为这个 Query 对所有涉及的 Archetype 的所有 Component 具有完全的读写权限，以最大限度保证并行安全。

然而，创建和销毁 Entity 有的时候并不是必须立刻被执行的，比如延迟到当前 Stage 或当前帧结束，此时就可以用 DeferredCommand 作为替代，DeferredCommand 不需要在 Query 中进行指定即可使用，也不会影响依赖关系，能够让 TickSystem 比使用 InstantCommand 时具有更好的并行性。