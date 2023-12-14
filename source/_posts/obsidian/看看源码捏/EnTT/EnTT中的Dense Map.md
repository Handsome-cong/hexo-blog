---
publish: true
title: EnTT源码解读【6】：EnTT中的Dense Map
date: 2023-12-14 14:56
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
# EnTT 中的 Dense Map
## 什么是 Dense Map
顾名思义，首先，它是个*map*，它应和 C++ 中的 `std::map` 有着相同的功能，然后，既然能被 "Dense" 一词所修饰，那么说明它存储的数据应该是*紧凑*的。

即，**Dense Map**是一个数据紧凑存储的类*map*数据结构。

> 这里的“数据紧凑”仅体现在遍历操作可以直接在一块连续的内存上进行，并不要求数据结构里处处紧凑。

## EnTT 中的 Dense Map 的基本原理
### 存储结构
`dense_map` 的部分定义如下：
```cpp
// src/entt/container/dense_map.hpp

template<typename Key, typename Type>
struct dense_map_node final {
    using value_type = std::pair<Key, Type>;

	...

    std::size_t next;
    value_type element;
};

/**
 * @brief Associative container for key-value pairs with unique keys.
 *
 * Internally, elements are organized into buckets. Which bucket an element is
 * placed into depends entirely on the hash of its key. Keys with the same hash
 * code appear in the same bucket.
 *
 * @tparam Key Key type of the associative container.
 * @tparam Type Mapped type of the associative container.
 * @tparam Hash Type of function to use to hash the keys.
 * @tparam KeyEqual Type of function to use to compare the keys for equality.
 * @tparam Allocator Type of allocator used to manage memory and elements.
 */
template<typename Key, typename Type, typename Hash, typename KeyEqual, typename Allocator>
class dense_map {
    static constexpr float default_threshold = 0.875f;
    static constexpr std::size_t minimum_capacity = 8u;

    using node_type = internal::dense_map_node<Key, Type>;
    using alloc_traits = std::allocator_traits<Allocator>;
    static_assert(std::is_same_v<typename alloc_traits::value_type, std::pair<const Key, Type>>, "Invalid value type");
    using sparse_container_type = std::vector<std::size_t, typename alloc_traits::template rebind_alloc<std::size_t>>;
    using packed_container_type = std::vector<node_type, typename alloc_traits::template rebind_alloc<node_type>>;
    
    ...
    
private:
    compressed_pair<sparse_container_type, hasher> sparse;
    compressed_pair<packed_container_type, key_equal> packed;
    float threshold;
};
```

它主要包含两个部分，一个存储数据的 `packed` 和一个辅助索引数据的 `sparse`，显然 `packed` 就是这个数据结构能被称之为 "Dense" 的原因，它内部是没有空穴的。

`threshold` 这个字段用于扩容。当 `packed` 的大小与 `sparse` 的大小的比值超过 `threshold` 时，就会进行 rehash 并扩容。默认值为 `default_threshold`，即 0.875。

`dense_map_node` 类型用于描述 `packed` 中存储的数据，其中 `element` 字段很好理解，代表数据本体，是一个键值对，而 `next` 字段则用于发生 hash 碰撞时连接多个数据，它是一个用于 `packed` 的下标。

### 各部分的关系
`sparse` 中存储了多个索引，是指向 `packed` 的下标，对于空索引，值为索引类型对应的最大值，每个非空索引都指向了*bucket*中的第一个节点。

**bucket**在 `dense_map` 中是一个抽象的概念，它存于 `packed` 中，`packed` 被分为若干个 bucket，其数量等于 `sparse` 的长度。

> bucket 在这里的概念和开散列（拉链法）实现的 map 中，发生 hash 碰撞时创建的链表有点相似，只是 bucket 中头节点以外的内容任然存于 `packed` 内，而这一点又与闭散列的 map 有点类似，但它不像闭散列那样后续节点按位置往后顺延，而是通过一个 `next` 字段进行索引。

`packed` 是存储数据的主体部分，被分为若干个*bucket*。

某种可能的情况如下图所示：  
![EnTT中的Dense Map relationship.svg](EnTT中的Dense Map relationship.svg)  
图中，格子内的数字表示 packed 部分的索引，无数字的代表索引为空，索引值为索引类型最大值，无色的代表空节点。packed 中同色代表同 bucket，bucket 的头节点索引存于 sparse 中同色的节点内。

`sparse` 的索引为键的 hash，在 EnTT 中，若键为 `entt::entity` 类型，则直接将键转换为整型并取模使用，不进行额外计算。

### 基础操作 (CRUD)
#### 查询/修改
1. 通过键得到 `sparse` 中存储 bucket 头节点索引的位置的索引
2. 得到 bucket 头节点索引
3. 逐个检查 bucket 中的节点，键相等则返回

#### 增加
1. 先进行上述查询，检查是否已存在
2. 将新加的节点置于 `packed` 末尾
3. 将 `packed` 中最后一个元素的 `next` 设置为 `sparse` 中该节点所属 bucket 的头节点索引值
4. 设置 `sparse` 中该节点所属 bucket 的头节点索引值为 `packed` 尾节点索引

一个可能的情况如下：  
![EnTT中的Dense Map create.svg](EnTT中的Dense Map create.svg)
> 蓝色边框为产生了数据变动的元素

#### 删除
1. 先进行上述查询，检查是否已存在
2. 将存储被删节点索引的变量值改为被删节点的 `next` 字段值
3. 若被删节点不在 `packed` 末尾，将末尾节点值赋给被删节点，将存储末尾节点索引的变量值改为被删节点的索引值
4. `packed` 删除末尾节点 (`pop_back()`)

一个可能的情况如下：  
![EnTT中的Dense Map delete.svg](EnTT中的Dense Map delete.svg)
> 蓝色边框为产生了数据变动的元素

## 写在最后的一点碎碎念
说好的源码解析，源码呢？就几个字段定义？
- `dense_map` 的核心算法并不复杂，上面已经说明白了算法，源码不重要。
- `dense_map` 源码为了通用性，用了大量的模板，阅读过程极其恶心，看源码耗费的时间远超理解算法的时间，除非为了学习 C++ 模板，否则没意义，不如看结论。