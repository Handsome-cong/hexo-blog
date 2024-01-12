---
publish: true
title: EnTT源码解读【12】：EnTT中的Registry
date: 2024-01-06 17:42
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
# EnTT 中的 Registry
## 什么是 Registry
在一般 ECS 实现里，通常会有一个*用于存储和管理所有 Entity 和 Component* 的类型，这个类型经常会以 World 命名，但 EnTT 中叫 **Registry**。

Registry 是 EnTT 中将 Entity、Component 以及 System 组织起来的核心，一个 Registry 对象代表了一个 ECS 系统。

## EnTT 中 registry 的本质
EnTT 中的 `registry` 类型只是 `basic_registry<>` 的一个别名，

```cpp
// src/entt/entity/fwd.hpp

/*! @brief Default entity identifier. */
enum class entity : id_type {};

template<typename Entity = entity, typename = std::allocator<Entity>>
class basic_registry;

/*! @brief Alias declaration for the most common use case. */
using registry = basic_registry<>;
```

`registry` 默认使用自带的 `entity` 作为 Entity 的类型，`std::allocator<entity>` 作为内存分配器。

用户通过自定义 `basic_registry` 的模板参数来指定自己的 Entity 类型，合法的 Entity 类型见 [EnTT中的Entity > EnTT 中的 Entity 是什么](../../blog/EnTT中的Entity#EnTT 中的 Entity 是什么)。

## registry 的基本功能
### 创建/销毁 Entity
```cpp
// constructs a naked entity with no components and returns its identifier
auto entity = registry.create();

// destroys an entity and all its components
registry.destroy(entity);

registry.clear();
```

1. 创建 Entity
2. 删除 Entity
3. 删除所有 Entity

### 筛选 Entity
```cpp
// destroys all the entities in a range
auto view = registry.view<a_component, another_component>();
registry.destroy(view.begin(), view.end());
```

1. 筛选出了所有的同时具有 `a_component` 和 `another_component` 的 Entity
2. 将所有符合的 Entity 销毁

### 为 Entity 附加 Component
```cpp
registry.emplace<position>(entity, 0., 0.);

// ...

auto &vel = registry.emplace<velocity>(entity);
vel.dx = 0.;
vel.dy = 0.;

// default initialized type assigned by copy to all entities
registry.insert<position>(first, last);

// user-defined instance assigned by copy to all entities
registry.insert(from, to, position{0., 0.});
```

1. `emplace` 用于原地构造 Component
2. `insert` 用于插入现成的 Component

### 查询 Component 是否存在
```cpp
// true if entity has all the given components
bool all = registry.all_of<position, velocity>(entity);

// true if entity has at least one of the given components
bool any = registry.any_of<position, velocity>(entity);
```
1. `all_of` 判断 Entity 是否具有所有指定 Component
2. `any_of` 判断是否具有至少一个指定 Component

### 删除 Component
```cpp
registry.erase<position>(entity);
registry.remove<position>(entity);
registry.clear<position>();
```
1. 删除从指定的 `entity` 上删除 `position`，不判断 `position` 是否存在，不存在则报错
2. 删除从指定的 `entity` 上删除 `position`，判断 `position` 是否存在，不存在不报错
3. 删除所有 `position`

### 从 Entity 上获取 Component
```cpp
const auto &cregistry = registry;

// const and non-const reference
const auto &crenderable = cregistry.get<renderable>(entity);
auto &renderable = registry.get<renderable>(entity);

// const and non-const references
const auto [cpos, cvel] = cregistry.get<position, velocity>(entity);
auto [pos, vel] = registry.get<position, velocity>(entity);
```
也提供了 `try_get` 用于不确定 Component 是否存在的情况。

## registry 的基本原理
### 数据存储
`registry` 的字段定义如下：
```cpp
// src/entt/entity/fwd.hpp

/**
 * @brief Provides a common way to define storage types.
 * @tparam Type Storage value type.
 * @tparam Entity A valid entity type.
 * @tparam Allocator Type of allocator used to manage memory and elements.
 */
template<typename Type, typename Entity = entity, typename Allocator = std::allocator<Type>, typename = void>
struct storage_type {
    /*! @brief Type-to-storage conversion result. */
    using type = sigh_mixin<basic_storage<Type, Entity, Allocator>>;
};

/**
 * @brief Helper type.
 * @tparam Args Arguments to forward.
 */
template<typename... Args>
using storage_type_t = typename storage_type<Args...>::type;

/**
 * Type-to-storage conversion utility that preserves constness.
 * @tparam Type Storage value type, eventually const.
 * @tparam Entity A valid entity type.
 * @tparam Allocator Type of allocator used to manage memory and elements.
 */
template<typename Type, typename Entity = entity, typename Allocator = std::allocator<std::remove_const_t<Type>>>
struct storage_for {
    /*! @brief Type-to-storage conversion result. */
    using type = constness_as_t<storage_type_t<std::remove_const_t<Type>, Entity, Allocator>, Type>;
};

// src/entt/entity/registry.hpp

template<typename Allocator>
class registry_context {
    using alloc_traits = std::allocator_traits<Allocator>;
    using allocator_type = typename alloc_traits::template rebind_alloc<std::pair<const id_type, basic_any<0u>>>;

private:
    dense_map<id_type, basic_any<0u>, identity, std::equal_to<id_type>, allocator_type> ctx;
};

template<typename Entity, typename Allocator>
class basic_registry {
    using base_type = basic_sparse_set<Entity, Allocator>;

    using alloc_traits = std::allocator_traits<Allocator>;

    // std::shared_ptr because of its type erased allocator which is useful here
    using pool_container_type = dense_map<id_type, std::shared_ptr<base_type>, identity, std::equal_to<id_type>, typename alloc_traits::template rebind_alloc<std::pair<const id_type, std::shared_ptr<base_type>>>>;
    using group_container_type = dense_map<id_type, std::shared_ptr<internal::group_descriptor>, identity, std::equal_to<id_type>, typename alloc_traits::template rebind_alloc<std::pair<const id_type, std::shared_ptr<internal::group_descriptor>>>>;

	...

    /*! @brief Entity traits. */
    using traits_type = typename base_type::traits_type;
    /*! @brief Allocator type. */
    using allocator_type = Allocator;
    /*! @brief Underlying entity identifier. */
    using entity_type = typename traits_type::value_type;
    /*! @brief Underlying version type. */
    using version_type = typename traits_type::version_type;
    /*! @brief Unsigned integer type. */
    using size_type = std::size_t;
    /*! @brief Common type among all storage types. */
    using common_type = base_type;
    /*! @brief Context type. */
    using context = internal::registry_context<allocator_type>;

    /**
     * @copybrief storage_for
     * @tparam Type Storage value type, eventually const.
     */
    template<typename Type>
    using storage_for_type = typename storage_for<Type, Entity, typename alloc_traits::template rebind_alloc<std::remove_const_t<Type>>>::type;

	...

private:
    context vars;
    pool_container_type pools;
    group_container_type groups;
    storage_for_type<entity_type> entities;
};
```

从上述代码可以看出，registry 被分为 4 部分：
- `context vars`
- `pool_container_type pools`
- `group_container_type groups`
- `storage_for_type<entity_type> entities`

#### `vars`
`vars` 这个字段可以理解为一个用于存储全局（同一个 Registry 中）唯一的 Entity 的 Component 的容器。

`context` 是一个类似于依赖注入容器的东西，可以插入任意类型的对象，也可以尝试从中获取任意类型的对象实例，也支持在插入的时候进行命名来让它可以接受多个相同类型的对象，使用实例如下：
```cpp
// creates a new context variable by type and returns it
registry.ctx().emplace<my_type>(42, 'c');

// creates a new named context variable by type and returns it
registry.ctx().emplace_as<my_type>("my_variable"_hs, 42, 'c');

// inserts or assigns a context variable by (deduced) type and returns it
registry.ctx().insert_or_assign(my_type{42, 'c'});

// inserts or assigns a named context variable by (deduced) type and returns it
registry.ctx().insert_or_assign("my_variable"_hs, my_type{42, 'c'});

// gets the context variable by type as a non-const reference from a non-const registry
auto &var = registry.ctx().get<my_type>();

// gets the context variable by name as a const reference from either a const or a non-const registry
const auto &cvar = registry.ctx().get<const my_type>("my_variable"_hs);

// resets the context variable by type
registry.ctx().erase<my_type>();

// resets the context variable associated with the given name
registry.ctx().erase<my_type>("my_variable"_hs);
```

`context` 的核心是一个 `dense_map` 类型的 `ctx` 字段，其具体类型可以简单地看作是 `dense_map<uint32_t, void*>`，因此可以存储任意类型的数据。

> 上述说法只是为了方便理解并不准确，`basic_any` 还包含了类型信息、vtable、以及引用类型（所有者、读写、只读）。

> `dense_map` 相关内容可以查看 [EnTT中的Dense Map](../../blog/Hexo/看看源码捏/EnTT/EnTT中的Dense Map)

#### `pools`
`pools` 存储了 Registry 下的所有 Component，其类型可以简单看作 `dense_map<uint32_t, std::shared_ptr<sparse_set>>`。值 `std::shared_ptr<sparse_set>>` 其实指向的是各种 Component 对应的 `basic_storage`。键则是通过类型计算得出的一个 ID，具体请看 [EnTT中的类型标识](../../blog/EnTT中的类型标识)。

无论存储 Component 的 Storage 的所有权是否由某个 Group 所有，它都会存在 `pools` 里。

> Storage 相关内容可以查看 [EnTT中的Storage](../../blog/EnTT中的Storage)。

#### `groups`
`groups` 存储了 Registry 下的所有 Group，其类型可以简单看作 `dense_map<uint32_t, std::shared_ptr<internal::group_descriptor>>`。  
值 `std::shared_ptr<internal::group_descriptor>` 指向各种 `group_handler` 类型，这里的 `group_descriptor` 是 `group_handler` 的公共基类。键则是通过从其对应的值的类型上计算得出。

> Group 相关内容可以查看 [EnTT中的Group](../../blog/EnTT中的Group)

#### `entities`
`entities` 存储了 Registry 下的所有 Entity，其类型可以看作 `basic_storage<entity>`。

> 这里用的是一个专门为 `entity` 类型特化的 `basic_storage`，具体可以见 [EnTT中的Storage > Entity](../../blog/EnTT中的Storage#Entity)。

### 基础功能
Registry 是一个 ECS 系统的核心，它将 Entity、Component 已经 Group 联系了起来，并提供功能去创建和访问。但它本身仅仅只是一个容器，不包含什么特殊的算法。

它提供的主要功能有：
- 创建/销毁 Entity
- 为 Entity 创建/销毁 Component
- 创建 Group
- 创建 View

#### 创建/销毁 Entity
创建 Entity 的功能及其简单：
```cpp
// src/entt/entity/registry.hpp

/**
 * @brief Creates a new entity or recycles a destroyed one.
 * @return A valid identifier.
 */
[[nodiscard]] entity_type create() {
	return entities.emplace();
}
```

销毁也只是多了一步移除 Component 的操作：
```cpp
// src/entt/entity/registry.hpp

/**
 * @brief Destroys an entity and releases its identifier.
 *
 * @warning
 * Adding or removing components to an entity that is being destroyed can
 * result in undefined behavior.
 *
 * @param entt A valid identifier.
 * @return The version of the recycled entity.
 */
version_type destroy(const entity_type entt) {
	for(size_type pos = pools.size(); pos; --pos) {
		pools.begin()[pos - 1u].second->remove(entt);
	}

	entities.erase(entt);
	return entities.current(entt);
}
```

#### 为 Entity 创建/销毁 Component
创建 Component：
```cpp
// src/entt/entity/registry.hpp

/**
 * @brief Assigns the given component to an entity.
 *
 * The component must have a proper constructor or be of aggregate type.
 *
 * @warning
 * Attempting to assign a component to an entity that already owns it
 * results in undefined behavior.
 *
 * @tparam Type Type of component to create.
 * @tparam Args Types of arguments to use to construct the component.
 * @param entt A valid identifier.
 * @param args Parameters to use to initialize the component.
 * @return A reference to the newly created component.
 */
template<typename Type, typename... Args>
decltype(auto) emplace(const entity_type entt, Args &&...args) {
	return assure<Type>().emplace(entt, std::forward<Args>(args)...);
}
```

这里会先通过 `assure` 方法来确保存储该类型 Component 的 Storage 存在，然后在返回的 Storage 上调用方法来创建 Component。

`assure` 方法的定义如下：
```cpp
// src/entt/entity/registry.hpp

template<typename Type>
[[nodiscard]] auto &assure([[maybe_unused]] const id_type id = type_hash<Type>::value()) {
	if constexpr(std::is_same_v<Type, entity_type>) {
		return entities;
	} else {
		static_assert(std::is_same_v<Type, std::decay_t<Type>>, "Non-decayed types not allowed");
		auto &cpool = pools[id];

		if(!cpool) {
			using storage_type = storage_for_type<Type>;
			using alloc_type = typename storage_type::allocator_type;

			if constexpr(std::is_void_v<Type> && !std::is_constructible_v<alloc_type, allocator_type>) {
				// std::allocator<void> has no cross constructors (waiting for C++20)
				cpool = std::allocate_shared<storage_type>(get_allocator(), alloc_type{});
			} else {
				cpool = std::allocate_shared<storage_type>(get_allocator(), get_allocator());
			}

			cpool->bind(forward_as_any(*this));
		}

		ENTT_ASSERT(cpool->type() == type_id<Type>(), "Unexpected type");
		return static_cast<storage_for_type<Type> &>(*cpool);
	}
}

template<typename Type>
[[nodiscard]] const auto *assure([[maybe_unused]] const id_type id = type_hash<Type>::value()) const {
	if constexpr(std::is_same_v<Type, entity_type>) {
		return &entities;
	} else {
		static_assert(std::is_same_v<Type, std::decay_t<Type>>, "Non-decayed types not allowed");

		if(const auto it = pools.find(id); it != pools.cend()) {
			ENTT_ASSERT(it->second->type() == type_id<Type>(), "Unexpected type");
			return static_cast<const storage_for_type<Type> *>(it->second.get());
		}

		return static_cast<const storage_for_type<Type> *>(nullptr);
	}
}
```
逻辑很简单，`pools` 中，计算出的类型 ID 若存在则将值返回，不存在则创建再返回，对于 `entity` 类型则直接返回 `entities` 字段。

> 上面的代码里出现了名为 `bind` 的方法，这是用于绑定 Registry 的，方便区分被绑定对象属于哪个 Registry。

销毁 Component 的逻辑与创建非常类似：
```cpp
// src/entt/entity/registry.hpp

/**
 * @brief Removes the given components from an entity.
 * @tparam Type Type of component to remove.
 * @tparam Other Other types of components to remove.
 * @param entt A valid identifier.
 * @return The number of components actually removed.
 */
template<typename Type, typename... Other>
size_type remove(const entity_type entt) {
	return (assure<Type>().remove(entt) + ... + assure<Other>().remove(entt));
}
```
先确保存储每个 Component 类型的 Storage 都存在，然后逐一执行 `remove`。  
Storage 的 `remove` 返回的是 `bool`，成功则为 `true`，所以最后返回的是成功移除的 Component 数量。

#### 创建 Group
Group 一般不会由用户自己直接创建，而是使用 Registry 提供的方法，定义如下：
```cpp
// src/entt/entity/registry.hpp

/**
 * @brief Returns a group for the given components.
 * @tparam Owned Types of storage _owned_ by the group.
 * @tparam Get Types of storage _observed_ by the group, if any.
 * @tparam Exclude Types of storage used to filter the group, if any.
 * @return A newly created group.
 */
template<typename... Owned, typename... Get, typename... Exclude>
basic_group<owned_t<storage_for_type<Owned>...>, get_t<storage_for_type<Get>...>, exclude_t<storage_for_type<Exclude>...>>
group(get_t<Get...> = get_t{}, exclude_t<Exclude...> = exclude_t{}) {
	using handler_type = typename basic_group<owned_t<storage_for_type<Owned>...>, get_t<storage_for_type<Get>...>, exclude_t<storage_for_type<Exclude>...>>::handler;

	if(auto it = groups.find(type_hash<handler_type>::value()); it != groups.cend()) {
		return {*std::static_pointer_cast<handler_type>(it->second)};
	}

	std::shared_ptr<handler_type> handler{};

	if constexpr(sizeof...(Owned) == 0u) {
		handler = std::allocate_shared<handler_type>(get_allocator(), get_allocator(), assure<std::remove_const_t<Get>>()..., assure<std::remove_const_t<Exclude>>()...);
	} else {
		handler = std::allocate_shared<handler_type>(get_allocator(), assure<std::remove_const_t<Owned>>()..., assure<std::remove_const_t<Get>>()..., assure<std::remove_const_t<Exclude>>()...);
		[[maybe_unused]] const id_type elem[]{type_hash<std::remove_const_t<Owned>>::value()..., type_hash<std::remove_const_t<Get>>::value()..., type_hash<std::remove_const_t<Exclude>>::value()...};
		ENTT_ASSERT(std::all_of(groups.cbegin(), groups.cend(), [&elem](const auto &data) { return data.second->owned(elem, sizeof...(Owned)) == 0u; }), "Conflicting groups");
	}

	groups.emplace(type_hash<handler_type>::value(), handler);
	return {*handler};
}
```
这里的逻辑无非也就是找得到就返回，找不到就创建再返回。

这里返回的 `basic_group` 只是一层对 `group_handler` 的包装，具体请看 [EnTT中的Group > basic_group](../../blog/EnTT中的Group#basic_group)。

从上可以看出，字段 `groups` 中的键由如下代码通过类型计算得出：
```cpp
using handler_type = typename basic_group<owned_t<storage_for_type<Owned>...>, get_t<storage_for_type<Get>...>, exclude_t<storage_for_type<Exclude>...>>::handler;

groups.emplace(type_hash<handler_type>::value(), handler);
```

#### 创建 View
创建 View 的逻辑也非常简单：
```cpp
// src/entt/entity/registry.hpp

/**
 * @brief Returns a view for the given components.
 * @tparam Type Type of component used to construct the view.
 * @tparam Other Other types of components used to construct the view.
 * @tparam Exclude Types of components used to filter the view.
 * @return A newly created view.
 */
template<typename Type, typename... Other, typename... Exclude>
[[nodiscard]] basic_view<get_t<storage_for_type<const Type>, storage_for_type<const Other>...>, exclude_t<storage_for_type<const Exclude>...>>
view(exclude_t<Exclude...> = exclude_t{}) const {
	const auto cpools = std::make_tuple(assure<std::remove_const_t<Type>>(), assure<std::remove_const_t<Other>>()..., assure<std::remove_const_t<Exclude>>()...);
	basic_view<get_t<storage_for_type<const Type>, storage_for_type<const Other>...>, exclude_t<storage_for_type<const Exclude>...>> elem{};
	std::apply([&elem](const auto *...curr) { ((curr ? elem.storage(*curr) : void()), ...); }, cpools);
	return elem;
}

/*! @copydoc view */
template<typename Type, typename... Other, typename... Exclude>
[[nodiscard]] basic_view<get_t<storage_for_type<Type>, storage_for_type<Other>...>, exclude_t<storage_for_type<Exclude>...>>
view(exclude_t<Exclude...> = exclude_t{}) {
	return {assure<std::remove_const_t<Type>>(), assure<std::remove_const_t<Other>>()..., assure<std::remove_const_t<Exclude>>()...};
}
```
上述代码做的无非就一件事：将各个 Component 类型的 Storage 传给创建的 View，然后将 View 返回。

上述代码中的前一段是一个针对 `const` 的特化版本，逻辑上和后面的没有本质区别。

### 其它功能
Registry 的功能不止上述提到的部分，还包括了一些其它，之所以区分开，是因为这部分功能不算做 ECS 的核心功能，或者一般情况下能有更高效的做法。

这些功能包括但不限于：
- 从特定 Entity 上获取指定 Component
- 验证 Entity 是否属于当前 Registry
- 对 Component 进行排序

> 为什么“从特定 Entity 上获取指定 Component”也在此列？  
> ECS 中访问 Component 进行操作一般发生在 System 中，System 一般也不是仅针对某一个 Entity 执行的，而是一类特定的 Component 组合，此时往往会用到 View，而通过 View 获取 Component 的效率比通过 Registry 高得多。