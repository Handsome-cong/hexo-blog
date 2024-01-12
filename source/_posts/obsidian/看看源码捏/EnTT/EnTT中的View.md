---
publish: true
title: EnTT源码解读【9】：EnTT中的View
date: 2023-12-28 21:44
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
# EnTT 中的 View
## View 是什么
**View** 是一种*非侵入式*工具，用于处理 Entity 和 Component，而不会影响其他功能或增加内存消耗。

它可以在*不影响 Entity 和 Component 的情况下*，获取到二者的值或引用。它是 *EnTT 中用于获取拥有特定 Component 组合的 Entity 的工具*，在其它 ECS 库中，拥有类似功能的类型或概念一般被称为 Query。

另有一个与 View 类似的侵入式工具：[Group](../../blog/EnTT中的Group)

## View 的基本使用
一个普通的用例：
```cpp
auto view = registry.view<position, velocity, renderable>();

for(auto entity: view) {
    // a component at a time ...
    auto &position = view.get<position>(entity);
    auto &velocity = view.get<velocity>(entity);

    // ... multiple components ...
    auto [pos, vel] = view.get<position, velocity>(entity);

    // ... all components at once
    auto [pos, vel, rend] = view.get(entity);

    // ...
}
```

也可以指定要排除的 Component 类型：
```cpp
auto view = registry.view<position, velocity>(entt::exclude<renderable>);
```

使用 `each` 方法获得更高的性能：
```cpp
// through a callback
registry.view<position, velocity>().each([](auto entity, auto &pos, auto &vel) {
    // ...
});

// using an input iterator
for(auto &&[entity, pos, vel]: registry.view<position, velocity>().each()) {
    // ...
}
```

通过 `view.get` 获取 Component 拥有比通过 `registry.get` 更好的性能。

## View 的基本原理
### 数据存储
部分定义如下：
```cpp
// src/entt/entity/view.hpp

/**
 * @brief General purpose view.
 *
 * This view visits all entities that are at least in the given storage. During
 * initialization, it also looks at the number of elements available for each
 * storage and uses the smallest set in order to get a performance boost.
 *
 * @sa basic_view
 *
 * @tparam Get Types of storage iterated by the view.
 * @tparam Exclude Types of storage used to filter the view.
 */
template<typename... Get, typename... Exclude>
class basic_view<get_t<Get...>, exclude_t<Exclude...>> {
    template<typename Type, typename View, typename Other, std::size_t... VGet, std::size_t... VExclude, std::size_t... OGet, std::size_t... OExclude>
    friend auto internal::view_pack(const View &, const Other &, std::index_sequence<VGet...>, std::index_sequence<VExclude...>, std::index_sequence<OGet...>, std::index_sequence<OExclude...>);

    using base_type = std::common_type_t<typename Get::base_type..., typename Exclude::base_type...>;
    using underlying_type = typename base_type::entity_type;

	...

private:
    std::tuple<Get *...> pools;
    std::array<const common_type *, sizeof...(Exclude)> filter;
    const common_type *view;
};
```

在默认情况下，这里的 `Get` 和 `Exclude` 都是 `basic_storage` 类型。

可见，`basic_view` 被分为三部分：
- `pools`：存放了用于存储各个 `Get` 类型 Component 的 `basic_storage` 指针
- `filter`: 存放了用于存储各个 `Exclude` 类型 Component 的 `basic_storage`，但这里实际上用的是 `basic_sparse_set` 指针
- `view`：一个 `basic_sparse_set` 指针，实际上也是 `basic_storage`，用于驱动 `basic_view` 的遍历

### 创建与初始化
通过上述的例子可以发现，`basic_view` 时需要的参数分为两部分：
- Get: 必须包含的 Component 类型
- Exclude: 必须不包含的 Component 类型

一般情况下，`basic_view` 通过 `basic_registry` 创建。`basic_registry` 会负责创建 `basic_view` 的实例，并通过 `basic_view` 的 `storage` 方法，将所需的各个 `basic_storage` 对象分配给创建的 `basic_view` 实例：

```cpp
// src/entt/entity/view.hpp

/**
 * @brief Assigns a storage to a view.
 * @tparam Type Type of storage to assign to the view.
 * @param elem A storage to assign to the view.
 */
template<typename Type>
void storage(Type &elem) noexcept {
	storage<index_of<typename Type::value_type>>(elem);
}

/**
 * @brief Assigns a storage to a view.
 * @tparam Index Index of the storage to assign to the view.
 * @tparam Type Type of storage to assign to the view.
 * @param elem A storage to assign to the view.
 */
template<std::size_t Index, typename Type>
void storage(Type &elem) noexcept {
	if constexpr(Index < sizeof...(Get)) {
		std::get<Index>(pools) = &elem;
		refresh();
	} else {
		std::get<Index - sizeof...(Get)>(filter) = &elem;
	}
}
```

可见，不论 Component 是要查询的还是要过滤的，存入 `basic_view` 中的类型都是 `basic_storage`。

可以上到，上述代码中还调用了一个 `refresh` 函数，它的定义如下：
```cpp
// src/entt/entity/view.hpp

void unchecked_refresh() noexcept {
	view = std::get<0>(pools);
	std::apply([this](auto *, auto *...other) { ((this->view = other->size() < this->view->size() ? other : this->view), ...); }, pools);
}

/*! @brief Updates the internal leading view if required. */
void refresh() noexcept {
	if(view || std::apply([](const auto *...curr) { return ((curr != nullptr) && ...); }, pools)) {
		unchecked_refresh();
	}
}
```

`refresh` 函数会在 `view` 不为空，或者 `pools` 被填满的情况下，调用 `unchecked_refresh`。

`unchecked_refresh` 函数会遍历 `pools`，并将 `size()` 最小的一项赋值给 `view`。

### 遍历
在 `basic_view` 中有如下定义：
```cpp
// src/entt/entity/view.hpp

/*! @brief Bidirectional iterator type. */
using iterator = internal::view_iterator<common_type, sizeof...(Get) - 1u, sizeof...(Exclude)>;

/**
 * @brief Returns an iterator to the first entity of the view.
 *
 * If the view is empty, the returned iterator will be equal to `end()`.
 *
 * @return An iterator to the first entity of the view.
 */
[[nodiscard]] iterator begin() const noexcept {
	return view ? iterator{view->begin(0), view->end(0), opaque_check_set(), filter} : iterator{};
}

/**
 * @brief Returns an iterator that is past the last entity of the view.
 * @return An iterator to the entity following the last entity of the view.
 */
[[nodiscard]] iterator end() const noexcept {
	return view ? iterator{view->end(0), view->end(0), opaque_check_set(), filter} : iterator{};
}
```

显然，这里将“最短”的 `view` 作为遍历的依据。上面调用的 `opaque_check_set` 用于剔除 `view` 所代表的 `basic_storage`，定义如下：

```cpp
// src/entt/entity/view.hpp

[[nodiscard]] auto opaque_check_set() const noexcept {
	std::array<const common_type *, sizeof...(Get) - 1u> other{};
	std::apply([&other, pos = 0u, view = view](const auto *...curr) mutable { ((curr == view ? void() : void(other[pos++] = curr)), ...); }, pools);
	return other;
}
```

在 `view_iterator` 类型中，每一次 `++` 操作，都是将 `view.begin()` 返回的那个迭代器进行移动，若移动后未到 `end` 并且当前位置的数据不合法，则继续移动。验证数据合法的方法 `valid` 定义如下：

```cpp
// src/entt/entity/view.hpp

template<typename Type, typename Entity>
[[nodiscard]] auto all_of(const Type *elem, const std::size_t len, const Entity entt) noexcept {
    std::size_t pos{};
    for(; pos < len && elem[pos]->contains(entt); ++pos) {}
    return pos == len;
}

template<typename Type, typename Entity>
[[nodiscard]] auto none_of(const Type *elem, const std::size_t len, const Entity entt) noexcept {
    std::size_t pos{};
    for(; pos < len && !(elem[pos] && elem[pos]->contains(entt)); ++pos) {}
    return pos == len;
}

[[nodiscard]] bool valid(const typename iterator_type::value_type entt) const noexcept {
	return ((Get != 0u) || (entt != tombstone)) && (all_of(pools.data(), Get, entt)) && none_of(filter.data(), Exclude, entt);
}
```

这里的 `all_of` 和 `none_of` 分别用于验证 Entity 是否具有全部指定的 Component 和是否不具有任一指定的 Component。

### 查询
通过 `basic_view` 获取 Component 的方法定义如下：
```cpp
// src/entt/entity/view.hpp

/**
 * @brief Returns the components assigned to the given entity.
 * @tparam Type Type of the component to get.
 * @tparam Other Other types of components to get.
 * @param entt A valid identifier.
 * @return The components assigned to the entity.
 */
template<typename Type, typename... Other>
[[nodiscard]] decltype(auto) get(const entity_type entt) const {
	return get<index_of<Type>, index_of<Other>...>(entt);
}

/**
 * @brief Returns the components assigned to the given entity.
 * @tparam Index Indexes of the components to get.
 * @param entt A valid identifier.
 * @return The components assigned to the entity.
 */
template<std::size_t... Index>
[[nodiscard]] decltype(auto) get(const entity_type entt) const {
	if constexpr(sizeof...(Index) == 0) {
		return std::apply([entt](auto *...curr) { return std::tuple_cat(curr->get_as_tuple(entt)...); }, pools);
	} else if constexpr(sizeof...(Index) == 1) {
		return (std::get<Index>(pools)->get(entt), ...);
	} else {
		return std::tuple_cat(std::get<Index>(pools)->get_as_tuple(entt)...);
	}
}
```

可以看到，由于 `basic_view` 在模板中就包含了 Component 的类型信息，用于保存数据的 `pools` 字段用的也是 `std::tuple`，这样就可以直接通过模板参数在编译期间就确定 `pools` 的索引，免去了查询 Component 类型所属的 `basic_storage` 在哪个位置的过程，因此，通过 `basic_view` 获取 Component 比通过 `basic_registry` 获取更加地高效。