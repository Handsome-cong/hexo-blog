---
publish: true
title: EnTT源码解读【10】：EnTT中的Mixin
date: 2024-01-01 15:12
tags: EnTT
categories: blog
series: EnTT源码解读
keywords:
description:
top_img: https://user-images.githubusercontent.com/1812216/103550016-90752280-4ea8-11eb-8667-12ed2219e137.png
comments:
cover: https://user-images.githubusercontent.com/1812216/103550016-90752280-4ea8-11eb-8667-12ed2219e137.png9.png
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
# EnTT 中的 Mixin
## Mixin 是什么
此处的**Mixin**是 EnTT 中为了给 [Storage](../../blog/EnTT中的Storage) 添加 [Signal](../../blog/EnTT中的Signal) 支持而创建的一个工具。

不同于 Signal，Mixin 专门为 EnTT 的 ECS 部分而设计，它在内部被用于辅助管理 Component 的生命周期，用于也可以通过它实现一些额外的功能。

## 提供的功能
Mixin 主要*为 Storage 提供一些事件的注册和触发功能*，包括：
- `on_construct`：当 Component 被分配给 Entity 后触发
- `on_update`：当 Component 被更新后
- `on_destroy`：当 Component 被移除前

> 这里的 `on_update` 仅由 `replace`、`emplace_or_replace` 和 `patch` 方法触发，并非任意的值改动。

在 EnTT 的 ECS 内部，用于存储 Component 的 `basic_storage` 类型都不是直接使用的，都会在外面套一层 `basic_sigh_mixin`，得到类似下面这样的类型：
```cpp
basic_sigh_mixin<basic_storage<MyComponent>>
```

> 上述类型只是为了方便理解，实际上还会包含 Entity、Registry 和分配器的类型信息。

因此在我的其它文章中，例如 [EnTT中的Group](../../blog/EnTT中的Group) 和 [EnTT中的View](../../blog/EnTT中的View)，提到的存储 `basic_storage` 类型的说法不一定是准确的，只是为了方便理解才这么写。虽然它们存的实际上是 `basic_sigh_mixin`，但是大部分情况下并不会直接使用 `basic_sigh_mixin` 的功能。

## 基本原理
### 数据存储
部分定义：
```cpp
// src/entt/entity/mixin.hpp

/**
 * @brief Mixin type used to add signal support to storage types.
 *
 * The function type of a listener is equivalent to:
 *
 * @code{.cpp}
 * void(basic_registry<entity_type> &, entity_type);
 * @endcode
 *
 * This applies to all signals made available.
 *
 * @tparam Type Underlying storage type.
 * @tparam Registry Basic registry type.
 */
template<typename Type, typename Registry>
class basic_sigh_mixin final: public Type {
    using underlying_type = Type;
    using owner_type = Registry;

    using basic_registry_type = basic_registry<typename underlying_type::entity_type, typename underlying_type::base_type::allocator_type>;
    using sigh_type = sigh<void(owner_type &, const typename underlying_type::entity_type), typename underlying_type::allocator_type>;
    using underlying_iterator = typename underlying_type::base_type::basic_iterator;

	...

private:
    basic_registry_type *owner;
    sigh_type construction;
    sigh_type destruction;
    sigh_type update;
};
```

可以看到，`basic_sigh_mixin` 有四部分构成：
- `owner`：存储所属的 Registry
- `construction`：存储 `on_construct` 事件的回调
- `destruction`：存储 `on_destroy` 事件的回调
- `update`：存储 `on_update` 事件的回调

`owner` 是为了回调参数而存储的，内部不会使用，其余部分很好理解，就不再赘述。

这里的事件回调类型形如：
```cpp
void(basic_registry<entity_type> &, entity_type);
```

### 函数注册
`basic_sigh_mixin` 提供了三个方法提供函数注册，分别对应三个事件：
- `on_construct`
- `on_update`
- `on_destroy`

它们都返回一个 `sink`，使用方式参考 [sink](../../blog/EnTT中的Signal#`sink`)。

```cpp
// src/entt/entity/mixin.hpp

/**
 * @brief Returns a sink object.
 *
 * The sink returned by this function can be used to receive notifications
 * whenever a new instance is created and assigned to an entity.<br/>
 * Listeners are invoked after the object has been assigned to the entity.
 *
 * @sa sink
 *
 * @return A temporary sink object.
 */
[[nodiscard]] auto on_construct() noexcept {
	return sink{construction};
}

/**
 * @brief Returns a sink object.
 *
 * The sink returned by this function can be used to receive notifications
 * whenever an instance is explicitly updated.<br/>
 * Listeners are invoked after the object has been updated.
 *
 * @sa sink
 *
 * @return A temporary sink object.
 */
[[nodiscard]] auto on_update() noexcept {
	return sink{update};
}

/**
 * @brief Returns a sink object.
 *
 * The sink returned by this function can be used to receive notifications
 * whenever an instance is removed from an entity and thus destroyed.<br/>
 * Listeners are invoked before the object has been removed from the entity.
 *
 * @sa sink
 *
 * @return A temporary sink object.
 */
[[nodiscard]] auto on_destroy() noexcept {
	return sink{destruction};
}
```

### 事件触发
`basic_sigh_mixin` 中存在几个方法与 `basic_storage` 中的方法同名，以此来接管 `basic_storage` 的方法调用。

#### on_construct
```cpp
// src/entt/entity/mixin.hpp

/**
 * @brief Emplace elements into a storage.
 *
 * The behavior of this operation depends on the underlying storage type
 * (for example, components vs entities).<br/>
 * Refer to the specific documentation for more details.
 *
 * @return A return value as returned by the underlying storage.
 */
auto emplace() {
	const auto entt = underlying_type::emplace();
	construction.publish(owner_or_assert(), entt);
	return entt;
}

/**
 * @brief Emplace elements into a storage.
 *
 * The behavior of this operation depends on the underlying storage type
 * (for example, components vs entities).<br/>
 * Refer to the specific documentation for more details.
 *
 * @tparam Args Types of arguments to forward to the underlying storage.
 * @param hint A valid identifier.
 * @param args Parameters to forward to the underlying storage.
 * @return A return value as returned by the underlying storage.
 */
template<typename... Args>
decltype(auto) emplace(const entity_type hint, Args &&...args) {
	if constexpr(std::is_same_v<typename underlying_type::value_type, typename underlying_type::entity_type>) {
		const auto entt = underlying_type::emplace(hint, std::forward<Args>(args)...);
		construction.publish(owner_or_assert(), entt);
		return entt;
	} else {
		underlying_type::emplace(hint, std::forward<Args>(args)...);
		construction.publish(owner_or_assert(), hint);
		return this->get(hint);
	}
}

/**
 * @brief Emplace elements into a storage.
 *
 * The behavior of this operation depends on the underlying storage type
 * (for example, components vs entities).<br/>
 * Refer to the specific documentation for more details.
 *
 * @tparam It Iterator type (as required by the underlying storage type).
 * @tparam Args Types of arguments to forward to the underlying storage.
 * @param first An iterator to the first element of the range.
 * @param last An iterator past the last element of the range.
 * @param args Parameters to use to forward to the underlying storage.
 */
template<typename It, typename... Args>
void insert(It first, It last, Args &&...args) {
	underlying_type::insert(first, last, std::forward<Args>(args)...);

	if(auto &reg = owner_or_assert(); !construction.empty()) {
		for(; first != last; ++first) {
			construction.publish(reg, *first);
		}
	}
}
```

`emplace` 用于分配单个 Component，`insert` 用于一次性分配多个。

`on_construct` 在调用 `emplace` 或 `insert` 时触发，调用发生在调用父类的 `emplace` 或 `insert` 后，也就是先完成 Component 的分配，再进行调用。对于 `insert`，会在完成所有 Component 分配后分别对每一个新的 Component 调用事件回调函数。

#### on_update
```cpp
// src/entt/entity/mixin.hpp

/**
 * @brief Patches the given instance for an entity.
 * @tparam Func Types of the function objects to invoke.
 * @param entt A valid identifier.
 * @param func Valid function objects.
 * @return A reference to the patched instance.
 */
template<typename... Func>
decltype(auto) patch(const entity_type entt, Func &&...func) {
	underlying_type::patch(entt, std::forward<Func>(func)...);
	update.publish(owner_or_assert(), entt);
	return this->get(entt);
}
```

`patch` 用于对一个 Component 应用一个或多个回调，进行修改。修改 Component 的内容不一定要通过 `patch`，也有其它途径能获取 Component 的引用，然后通过引用对其进行修改，但是只有通过这里的 `patch` 方法，才会触发相应的事件。

`on_update` 在调用完所有传入的回调后触发一次。

#### on_destroy
```cpp
// src/entt/entity/mixin.hpp

void pop(underlying_iterator first, underlying_iterator last) final {
	if(auto &reg = owner_or_assert(); destruction.empty()) {
		underlying_type::pop(first, last);
	} else {
		for(; first != last; ++first) {
			const auto entt = *first;
			destruction.publish(reg, entt);
			const auto it = underlying_type::find(entt);
			underlying_type::pop(it, it + 1u);
		}
	}
}

void pop_all() final {
	if(auto &reg = owner_or_assert(); !destruction.empty()) {
		for(auto it = underlying_type::base_type::begin(0), last = underlying_type::base_type::end(0); it != last; ++it) {
			if constexpr(std::is_same_v<typename underlying_type::value_type, typename underlying_type::entity_type>) {
				destruction.publish(reg, *it);
			} else {
				if constexpr(underlying_type::traits_type::in_place_delete) {
					if(const auto entt = *it; entt != tombstone) {
						destruction.publish(reg, entt);
					}
				} else {
					destruction.publish(reg, *it);
				}
			}
		}
	}

	underlying_type::pop_all();
}
```

`pop` 用于移除任意个 Component，而 `pop_all` 用于移除全部。

与前二者不同，这里是用传统的方法重写实现的，而前面则是同名方法覆盖，对于用户而言，明面上调用的将会是 `basic_sparse_set` 中的方法。

与 `on_construct` 中的 `insert` 操作不同，这里不管是 `pop` 还是 `pop_all`，事件回调函数会分别在每一个 Component 被移除之前调用。