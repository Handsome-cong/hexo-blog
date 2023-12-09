---
publish: true
title: EnTT源码解读【5】：EnTT中的Storage
date: 2023-12-06 18:48
tags:
  - EnTT
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
# EnTT 中的 Storage
## EnTT 中的 Storage 是什么
EnTT 中的 Storage，准确地说是 `basic_storage`，是一个继承 `basic_sparse_set` 的类型，用于将各种类型的对象 (Component) 和 Entity 相关联。

## 基本原理
### 数据存储
既然继承 `basic_sparse_set`，自然 `basic_sparse_set` 有的它都有，除此之外，它还多了一个 `payload` 字段，用于存储关联的对象，相关定义如下：
```cpp
// src/entt/entity/storage.hpp

template<typename Type, typename Entity, typename Allocator, typename>
class basic_storage: public basic_sparse_set<Entity, typename std::allocator_traits<Allocator>::template rebind_alloc<Entity>> {
    using alloc_traits = std::allocator_traits<Allocator>;
    static_assert(std::is_same_v<typename alloc_traits::value_type, Type>, "Invalid value type");
    using container_type = std::vector<typename alloc_traits::pointer, typename alloc_traits::template rebind_alloc<typename alloc_traits::pointer>>;

	...
	
    container_type payload;
};
```

默认情况下，`payload` 的类型为 `vector<Type*>`。

`payload` 的存储逻辑与 `basic_sparse_set` 中的 `sparse` 相似，都采用了同样大小的分页设计。

`payload` 中关联到 Entity 的对象的位置与 Entity 在 `packed` 中的下标是有关的，假定 `packed` 中的下标为 `index`，关系如下：
```cpp
payload[index / page_size][index % page_size]
```

和 Entity 索引的存放方式非常类似，见 [EnTT中的Sparse Set](../c312304b9cec#数据映射关系)。

`page_size` 可自定义，具体见 [EnTT中的Component](../bfaf6a4c6f46#page-size)。

`payload` 的示意图：  
![EnTT中的Storage payload.excalidraw](https://picgo.handsome-cong.fun/Gallery/hexo/images/EnTT%E4%B8%AD%E7%9A%84Storage%20payload.excalidraw.svg)

`payload` 的 page 内存分配策略和 `sparse` 不同，`payload` 中分配 page 会保证 `payload` 没有空穴，不存在 `null_ptr`。
> 举个例子，若 `payload` 现在为空，要在下标为 2 的地方分配一个 page，那么会连带着下标 0 和 1 的 page 一起分配。而 `sparse` 不会，它只会在下标为 2 的地方分配一个 page。

`payload` 中的对象的内存在创建 page 时就已经分配好了，只是刚开始的时候没有与 Entity 相关联，也没有初始化。

`payload` 和 `sparse` 二者分配 page 的源码：
```cpp
// src/entt/entity/sparse_set.hpp
[[nodiscard]] auto &assure_at_least(const Entity entt) {
	const auto pos = static_cast<size_type>(traits_type::to_entity(entt));
	const auto page = pos / traits_type::page_size;

	if(!(page < sparse.size())) {
		sparse.resize(page + 1u, nullptr);
	}

	if(!sparse[page]) {
		auto page_allocator{packed.get_allocator()};
		sparse[page] = alloc_traits::allocate(page_allocator, traits_type::page_size);
		std::uninitialized_fill(sparse[page], sparse[page] + traits_type::page_size, null);
	}

	return sparse[page][fast_mod(pos, traits_type::page_size)];
}
```

### 变体
`basic_storage` 存在两个偏特化的变体

#### 空对象
一个针对空对象的优化版本：
```cpp
template<typename Type, typename Entity, typename Allocator>
class basic_storage<Type, Entity, Allocator, std::enable_if_t<component_traits<Type>::page_size == 0u>>
    : public basic_sparse_set<Entity, typename std::allocator_traits<Allocator>::template rebind_alloc<Entity>> {}
```
此处检测的是类型的 `page_size`，若用户定义了 `ENTT_NO_ETO` 宏，则此类型不起作用。

自然的，这个版本没有 `payload`。

#### Entity
针对 Entity 的特化版本：
```cpp
template<typename Entity, typename Allocator>
class basic_storage<Entity, Entity, Allocator>
    : public basic_sparse_set<Entity, Allocator> {}
```

其功能基本就是套皮 `basic_sparse_set`，但通过这个 `basic_storage` 创建 Entity 会优先复用已经删除的 Entity。

同样不需要 `payload`。