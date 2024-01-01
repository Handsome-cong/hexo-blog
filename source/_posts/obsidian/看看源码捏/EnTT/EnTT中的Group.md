---
publish: true
title: EnTT源码解读【11】：EnTT中的Group
date: 2023-12-30 15:40
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
# EnTT 中的 Group
## Group 是什么
**Group**是一种侵入性工具，用于处理 Entity 和 Component，可提高关键路径的性能，但它本身也会带来额外的性能损耗和使用限制。

另一个同样可以访问 Entity 和 Component 但非侵入性的工具：[View](../../blog/EnTT中的View)

虽然单从功能上来看 Group 和 View 很接近，但在其它 ECS 库中，与 Group 最接近的概念是 Archetype。

> Group 和 Archetype 只是责任类似，原理是完全不同的。  
> Group 更像是一个 Archetype 和 Query 的结合体，且它对 Entity 和 Component 的编排方式与 Archetype 完全不同，只是都有编排的能力。

## Group 的基本使用
与 View 十分类似：
```cpp
auto group = registry.group<position>(entt::get<velocity, renderable>);

for(auto entity: group) {
    // a component at a time ...
    auto &position = group.get<position>(entity);
    auto &velocity = group.get<velocity>(entity);

    // ... multiple components ...
    auto [pos, vel] = group.get<position, velocity>(entity);

    // ... all components at once
    auto [pos, vel, rend] = group.get(entity);

    // ...
}

// through a callback
registry.group<position>(entt::get<velocity>).each([](auto entity, auto &pos, auto &vel) {
    // ...
});

// using an input iterator
for(auto &&[entity, pos, vel]: registry.group<position>(entt::get<velocity>).each()) {
    // ...
}
```

与 View 的参数分为两部分不同，Group 的参数分为三部分：
- Owned：必须包含，且 Group 获取所有权的 Component 类型
- Get: 必须包含，且 Group 不获取所有权的 Component 类型
- Exclude: 必须不包含的 Component 类型

一个例子：
```cpp
auto group = registry.group<position>(entt::get<velocity>, entt::exclude<renderable>);
```
上述例子中，`group` 获取了 `position` 的所有权，并且保证通过它遍历出来的 Entity 必定拥有 `velocity`，以及必定不拥有 `renderable`。

## Group 的基本原理
### 数据存储
#### basic_group
部分定义：
```cpp
// src/entt/entity/group.hpp

/**
 * @brief Owning group.
 *
 * Owning groups returns all entities and only the entities that are at
 * least in the given storage. Moreover:
 *
 * * It's guaranteed that the entity list is tightly packed in memory for fast
 *   iterations.
 * * It's guaranteed that all components in the owned storage are tightly packed
 *   in memory for even faster iterations and to allow direct access.
 * * They stay true to the order of the owned storage and all instances have the
 *   same order in memory.
 *
 * The more types of storage are owned, the faster it is to iterate a group.
 *
 * @b Important
 *
 * Iterators aren't invalidated if:
 *
 * * New elements are added to the storage.
 * * The entity currently pointed is modified (for example, components are added
 *   or removed from it).
 * * The entity currently pointed is destroyed.
 *
 * In all other cases, modifying the pools iterated by the group in any way
 * invalidates all the iterators.
 *
 * @tparam Owned Types of storage _owned_ by the group.
 * @tparam Get Types of storage _observed_ by the group.
 * @tparam Exclude Types of storage used to filter the group.
 */
template<typename... Owned, typename... Get, typename... Exclude>
class basic_group<owned_t<Owned...>, get_t<Get...>, exclude_t<Exclude...>> {
    using base_type = std::common_type_t<typename Owned::base_type..., typename Get::base_type..., typename Exclude::base_type...>;
    using underlying_type = typename base_type::entity_type;

    template<typename Type>
    static constexpr std::size_t index_of = type_list_index_v<std::remove_const_t<Type>, type_list<typename Owned::value_type..., typename Get::value_type..., typename Exclude::value_type...>>;

	...
	
public:

	...
	
    /*! @brief Group handler type. */
    using handler = internal::group_handler<owned_t<std::remove_const_t<Owned>...>, get_t<std::remove_const_t<Get>...>, exclude_t<std::remove_const_t<Exclude>...>>;
    
	...
	
private:
    handler *descriptor;
};
```

显然，`basic_group` 只是对 `group_handler` 类型的一层封装。

`basic_group` 提供的主要功能包括：
- 对 Entity 和 Component 进行遍历
- 对 Entity 和 Component 进行排序
- 获取特定 Entity 的特定 Component

#### group_handler
部分定义：
```cpp
// src/entt/entity/group.hpp

struct group_descriptor {
    using size_type = std::size_t;
    virtual ~group_descriptor() = default;
    virtual size_type owned(const id_type *, const size_type) const noexcept {
        return 0u;
    }
};

template<typename, typename, typename>
class group_handler;

template<typename... Owned, typename... Get, typename... Exclude>
class group_handler<owned_t<Owned...>, get_t<Get...>, exclude_t<Exclude...>> final: public group_descriptor {
    // nasty workaround for an issue with the toolset v141 that doesn't accept a fold expression here
    static_assert(!std::disjunction_v<std::bool_constant<Owned::traits_type::in_place_delete>...>, "Groups do not support in-place delete");
    static_assert(!std::disjunction_v<std::is_const<Owned>..., std::is_const<Get>..., std::is_const<Exclude>...>, "Const storage type not allowed");

    using base_type = std::common_type_t<typename Owned::base_type..., typename Get::base_type..., typename Exclude::base_type...>;
    using entity_type = typename base_type::entity_type;

	...

private:
    std::tuple<Owned *..., Get *...> pools;
    std::tuple<Exclude *...> filter;
    std::size_t len;
```

在默认情况下，这里的 `Owned` 、 `Get` 和 `Exclude` 都是 `basic_storage` 类型。

可见，`group_handler` 被分为三部分：
- `pools`：存放了用于存储各个 `Owned` 和 `Get` 类型 Component 的 `basic_storage` 指针，`Owned` 部分代表 Component 所有权移交当前 Group 的部分，`Get` 代表遍历得到的 Entity 必须包含的 Component 的部分
- `filter`: 存放了用于存储各个 `Exclude` 类型 Component 的 `basic_storage` 指针
- `len`: 一个长度，用于记录符合当前 Group 的 Entity 的数量

`group_handler` 的数据存储部分和 `view` 非常相似：
- 都包含一个 `pools` 字段用于表示“有”的部分
- 都包含一个 `filter` 字段用于表示“没有”的部分

### 所有权
这是 Group 和 View 存在根本性差距的地方。

View 不会获取 Component 的所有权，不会对存储 Component 的 Storage 做出修改。它存储的数据仅仅用于获取和筛选 Entity 或 Component，本身非常轻量。

Group 会获取 `Owned` 模板参数指定的 Component 的所有权，会对存储 Component 的 Storage 做出修改以加速部分情况下的遍历。由于需要*编排 Entity 和 Component 的位置*和*监测 Entity 的 Component 组合的改变*，它会带来额外的性能开销。同时由于 Group 会获取 Component 的所有权，无法创建两个拥有同一 Component 类型的 Group，哪怕它们理论上遍历得到的 Entity 永远不可能相交。

> 例如：  
> 一个 Group 要求持有类型 A 的所有权且不包含类型 B，另一个 Group 要求持有类型 B 的所有权且包含类型 B。  
> 显然，符合这两个 Group 的 Component 组合永远不可能相交，但是并不能创建这两个 Group。

### 数据编排
与 View 的非侵入式不同，Group 会移动其中存储的 Component 的位置，这也是它需要获取 Component 的所有权的原因。

当 Group 创建时，或者涉及到所有权被某个 Group 所拥有的 Component 被添加/删除时，会尝试对数据进行编排，来让符合 Group 要求的 Entity 及其 Component 满足如下特性：
- Entity 和 Component 会位于各自存储容器的开头位置，且紧密排列
- 各个 Entity 及其 Component 在容器中的索引保持一致

假设存在三个 Component 类型："position"、"name"、"speed"，下面是一个可能的例子：  
![EnTT中的Group data storage.svg](EnTT中的Group data storage.svg)  
上图中的数字代表 Entity 的 ID，绿色代表 Component 的组合符合 Group 要求，红色代表不符合。两个蓝色虚线框分别框选出了两个 Entity，它们的 Component 在容器中的位置保证相同。

#### 初始化
见下面一段代码：
```cpp
// src/entt/entity/group.hpp

void push_on_construct(const entity_type entt) {
	if(!elem.contains(entt)
	   && std::apply([entt](auto *...cpool) { return (cpool->contains(entt) && ...); }, pools)
	   && std::apply([entt](auto *...cpool) { return (!cpool->contains(entt) && ...); }, filter)) {
		elem.push(entt);
	}
}

template<typename Alloc>
group_handler(const Alloc &alloc, Get &...gpool, Exclude &...epool)
	: pools{&gpool...},
	  filter{&epool...},
	  elem{alloc} {
	std::apply([this](auto *...cpool) { ((cpool->on_construct().template connect<&group_handler::push_on_construct>(*this), cpool->on_destroy().template connect<&group_handler::remove_if>(*this)), ...); }, pools);
	std::apply([this](auto *...cpool) { ((cpool->on_construct().template connect<&group_handler::remove_if>(*this), cpool->on_destroy().template connect<&group_handler::push_on_destroy>(*this)), ...); }, filter);

	for(const auto entity: static_cast<base_type &>(*std::get<0>(pools))) {
		push_on_construct(entity);
	}
}
```

这是 `group_handler` 的构造函数，可见其中主要包含了两部分逻辑：  
1. 为三类 Component 类型分别注册 `on_destroy` 和 `on_construct` 事件
2. 对当前已经存在的 Component 进行处理