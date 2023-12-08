---
publish: true
title: EnTT源码解读【4】：EnTT中的Sparse Set
date: 2023-12-06 18:56
updated: 星期三 6日 十二月 2023 18:56:02
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
# EnTT 中的 Sparse Set
## 相关链接
{% btn 'https://skypjack.github.io/2020-08-02-ecs-baf-part-9/',来自 EnTT 作者的文章,far fa-hand-point-right %}
## 什么是 Sparse Set
**Sparse Set**，即稀疏集，是一个用于存储不同值的数据类型，功能上与 Hash Set 类似，都可以高效率地进行增删查。
> 为什么只有增删查，没有“改”？  
> 因为这里的 Sparse Set 从使用者的角度看，只存储键，而不是键值对，“改”相当于“删”+“增”。

与 Hash Set 的不同点：
- Sparse Set 的键一般只能使用整数，而 Hash Set 往往能使用任意类型
- Hash Set 会因为 Hash 碰撞而导致性能下降，Sparse Set 不存在 Hash 的过程，不会碰撞，能保证增删查都在 O(1) 的时间内完成
- Sparse Set 的数据是*可以*紧密排列的，可以高效地进行遍历，而 Hash Set 可能存在空穴

> EnTT 中 Sparse Set 的数据是否可能存在空穴依据选项而定。

## EnTT 中 Sparse Set 的基本原理

> 注意，EnTT 中的 Sparse Set 并没有作为一个通用的数据结构而设计，是专门为存储 Entity 而存在的。

### 数据存储
EnTT 中 Sparse Set 被分为两部分，都是 `std::vector`：
- **packed**，存储 Entity，顺序无关，根据创建时的选项，可能存在空穴，可通过 sparse 中存储的索引进行访问。
- **sparse**，存储 page 指针，每个 page 默认情况下存储了 1024 个索引。 
- **head**，一个整数，用于指向 `packed` 中的一个空位，不一定会用

> 1024 个整型，4096 字节，和 `ENTT_SPARSE_PAGE` 有关

此处源码有个非常迷惑人的点需要注意，以下两个分别是 `sparse` 和 `packed` 的类型：
```cpp
using sparse_container_type = std::vector<typename alloc_traits::pointer, typename alloc_traits::template rebind_alloc<typename alloc_traits::pointer>>;
using packed_container_type = std::vector<Entity, Allocator>;
```

可以看到，默认情况下，`sparse` 里存储的实际上是 `entt::entity*`，而 `packed` 里的是 `entt::entity`
> 上述代码里是填的是模板参数，需要自行带入

但是，通过 `sparse[i][j]` 获取到的 `entt::entity` 并非是作为 Entity 类型使用的，它的 "entity" 部分是 `packed` 的下标，用于指向一个真正的 Entity，"version" 部分和 `packed` 中对应 Entity 的 "version" 保持一致。

而且，`packed` 中存储也不一定就是真正的 Entity，某些情况下，会存储一个指向自身另一个位置的下标。

`sparse[i]` 分配过内存后，会全部设为 `entt::null`。

### 数据映射关系
假设已经存入了一个 Entity，取其 "entity" 部分，记为 `id`，那么，便可以通过类似如下的方法获取到 `packed` 中的 Entity：
```cpp
auto index = sparse[id / ENTT_SPARSE_PAGE][id % ENTT_SPARSE_PAGE]
auto result = packed[index]
```
> 上述并非 EnTT 中真实使用的源码，只是示例

### 行为选项
`sparse_set` 在创建的时候提供了一个参数用于指定增删时的操作，其类型定义如下：
```cpp
// src/entt/entity/fwd.hpp

/*! @brief Storage deletion policy. */
enum class deletion_policy : std::uint8_t {
    /*! @brief Swap-and-pop deletion policy. */
    swap_and_pop = 0u,
    /*! @brief In-place deletion policy. */
    in_place = 1u,
    /*! @brief Swap-only deletion policy. */
    swap_only = 2u
};

// src/entt/entity/sparse_set.hpp

/**
 * @brief Constructs an empty container with the given policy and allocator.
 * @param pol Type of deletion policy.
 * @param allocator The allocator to use (possibly default-constructed).
 */
explicit basic_sparse_set(deletion_policy pol, const allocator_type &allocator = {})
	: basic_sparse_set{type_id<void>(), pol, allocator} {}
```

此外还可以指定类型信息（EnTT 自带的 RTTI）和分配器信息，这里不一一说明。

### 行为逻辑
索引中只有 "entity" 部分才存储下标，"version" 部分保持和索引目标一致，不能换。因此对于交换操作，更新*索引*的时候都保持 "version" 部分不动。

接下来分别介绍不同选项的不同行为，源码太长，就不放了。

> 以下示意图中，绿框表示下一次插入的位置，绿背景表示已经插入的元素，红背景表示已被删除的元素。
#### swap_and_pop
可以保证 *`packed` 没有空穴 *。

这是默认选项，也是逻辑最简单的选项，用不到 `head`。

- *添加*操作，直接 `packed.push_back(entity)`，然后更新 `sparse` 中的索引，Entity 已存在则报错
- *删除*操作，从 `sparse` 中查找删除目标的索引和 `packed` 末尾的索引，将 `packed` 中二者的内容互换并更新索引，调用 `packed.pop_back()`

![EnTT中的Sparse Set swap_and_pop.excalidraw](https://picgo.handsome-cong.fun/Gallery/hexo/images/EnTT%E4%B8%AD%E7%9A%84Sparse%20Set%20swap_and_pop.excalidraw.svg)
> 某种可能的情况
#### swap_only
在 *`force_back` 一直传入 `true` 的情况下能保证 `packed` 没有空穴 *，这也是默认情况。

`head` 默认值为 0，且始终指向第一个空位。

- *添加*操作
  1. 尝试通过传入的 Entity 从 `sparse` 中获取索引
    - 索引为 `entt::null`，则 `packed.push_back(entity)`，更新索引
    - 索引不会 `entt::null`，则覆盖 `packed` 中的值并更新索引
  2. 若传入时指定了参数 `force_back` 为 `true`（默认 `true`），则将新加入的元素和 `packed` 中 `head` 位置的元素交换，并更新索引，`head++`。
- *删除*操作
  1. 通过传入的 Entity 从 `sparse` 中获取索引
  2. 将 `sparse` 中的索引和 `packed` 中对应的 Entity 的 `version` 部分都 +1
  3. 将 `packed` 中索引指向的内容和 `packed` 末尾互换，更新索引，`head--`。

![EnTT中的Sparse Set swap_only.excalidraw](https://picgo.handsome-cong.fun/Gallery/hexo/images/EnTT%E4%B8%AD%E7%9A%84Sparse%20Set%20swap_only.excalidraw.svg)
> 某种可能的情况，`head` 指向某个先前被删除的元素

需要注意的是，这里的删除操作只是更新 "version" 和换位，如果用户手动创建（直接构造一个 Entity）一个原 Entity 的 "version"+1 副本，是能从这个被删除过原 Entity 的 `sparse_set` 中查找到新的 Entity 副本的。

这也会导致新加入的 Entity 可能会被放置在被删除的 Entity 之后，使得 `packed` 产生空穴，因此存在一个 `force_back` 参数来将新加入的 Entity 与 `head` 位置的 Entity 互换，以此来消除空穴。

#### in_place
*`packed` 有空穴*。

传入的 `force_back` 为 `true` 时，会使用 `swap_and_pop` 的添加逻辑，但不影响删除操作，因此仍然有空穴。

`head` 默认为 -1，更准确地说，是 `entt::null`。

- *添加*操作
  1. 通过传入的 Entity 从 `sparse` 中获取索引
  2. `head` 不为 `entt::null` 并且 `force_back` 为 `false`
    - `false`：`swap_and_pop` 的添加逻辑
    - `true`：
      1. 将索引设置为 `head`，索引的 "version" 为传入 Entity 的 "version"。
      2. `head` 设置为 `head` 指向的 Entity 的 "entity" 部分
      3. 将 `head` 原先指向的位置设为传入的 Entity
- *删除*操作
  1. 通过传入的 Entity 从 `sparse` 中获取索引
  2. 将 `packed` 中索引位置的 Entity 的 "entity" 部分设为 `head`，"version" 部分设为 `entt::tombstone`
  3. 将 `head` 设为索引的 "entity" 部分
  4. 将索引设为 `entt::null`

![EnTT中的Sparse Set in_place.excalidraw](https://picgo.handsome-cong.fun/Gallery/hexo/images/EnTT%E4%B8%AD%E7%9A%84Sparse%20Set%20in_place.excalidraw.svg)
> 某种可能的情况，`head` 指向某个先前被删除的元素

## 各选项的差异
性能上，`swap_and_pop` 和 `swap_only` 没有什么差异，而 `in_place` 则会因为空穴导致在遍历的时候产生额外的性能损耗。

功能上，`in_place` 保证了 Entity 从插入到删除位置不会发生改变，具有指针稳定性，可以用在某些特定的需要保存 Entity 引用（或指针）的需求中。